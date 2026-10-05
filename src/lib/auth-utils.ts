import { SignJWT, jwtVerify } from 'jose'
import { NextRequest } from 'next/server'
import { prisma } from './prisma'

const getSecret = () => {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET environment variable is not set')
  return new TextEncoder().encode(secret)
}

export interface TokenPayload {
  sub: string
  messId: string
  role: string
}

export async function signToken(payload: TokenPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(getSecret())
}

/**
 * Verify a JWT AND re-check the member against the database.
 *
 * Returns null when the signature is invalid, the member was deactivated, or
 * they no longer belong to the mess in the token. The returned `role` is the
 * member's CURRENT role, not the one baked into the token, so demotions and
 * removals take effect immediately instead of after the 30-day expiry.
 */
export async function verifyToken(token: string): Promise<TokenPayload | null> {
  let claims: TokenPayload
  try {
    const { payload } = await jwtVerify<TokenPayload>(token, getSecret())
    if (!payload.sub || !payload.messId) return null
    claims = payload as TokenPayload
  } catch {
    return null
  }

  try {
    const member = await prisma.member.findUnique({
      where: { id: claims.sub },
      select: { isActive: true, messId: true, role: true },
    })
    if (!member?.isActive) return null

    if (member.messId === claims.messId) {
      return { sub: claims.sub, messId: claims.messId, role: member.role }
    }

    // Token is for a secondary mess (MessSwitcher) — membership must still be active
    const membership = await prisma.messMembership.findFirst({
      where: { memberId: claims.sub, messId: claims.messId, isActive: true },
      select: { role: true },
    })
    if (!membership) return null
    return { sub: claims.sub, messId: claims.messId, role: membership.role }
  } catch (err) {
    console.error('[auth] member lookup failed', err)
    return null
  }
}

export function extractToken(req: NextRequest): string | null {
  const auth = req.headers.get('Authorization')
  if (auth?.startsWith('Bearer ')) return auth.slice(7)
  return null
}

/**
 * Best-effort client IP for rate limiting. Proxies (Vercel, Railway) append
 * the address they saw to x-forwarded-for, so the LAST entry is the one a
 * client cannot spoof; earlier entries are client-controlled.
 */
export function clientIp(req: NextRequest): string {
  const realIp = req.headers.get('x-real-ip')?.trim()
  if (realIp) return realIp
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    const parts = forwarded.split(',').map((p) => p.trim()).filter(Boolean)
    if (parts.length > 0) return parts[parts.length - 1]
  }
  return 'unknown'
}
