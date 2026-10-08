/**
 * platform-auth.ts — Server-only auth for the platform console (super admins).
 *
 * Platform admins are a separate table and a separate token type
 * (audience "mealio-platform", 12-hour lifetime). A mess member token can
 * never open the console, and a console token can never act as a member.
 */

import { SignJWT, jwtVerify } from 'jose'
import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { extractToken } from './auth-utils'

const AUDIENCE = 'mealio-platform'

const secret = () => {
  const s = process.env.PLATFORM_JWT_SECRET || process.env.JWT_SECRET
  if (!s) throw new Error('JWT_SECRET environment variable is not set')
  return new TextEncoder().encode(s)
}

export interface PlatformAdminSession {
  id: string
  email: string
  name: string
}

export async function signPlatformToken(adminId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(adminId)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(secret())
}

export async function verifyPlatformRequest(req: NextRequest): Promise<PlatformAdminSession | null> {
  const token = extractToken(req)
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secret(), { audience: AUDIENCE })
    if (!payload.sub) return null
    const admin = await prisma.platformAdmin.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true, isActive: true, passwordChangedAt: true },
    })
    if (!admin?.isActive) return null
    if (admin.passwordChangedAt && payload.iat && payload.iat * 1000 < admin.passwordChangedAt.getTime() - 1000) {
      return null
    }
    return { id: admin.id, email: admin.email, name: admin.name }
  } catch {
    return null
  }
}

/** Use at the top of every /api/platform route. */
export async function requirePlatformAdmin(
  req: NextRequest,
): Promise<{ admin: PlatformAdminSession; error?: never } | { admin?: never; error: NextResponse }> {
  const admin = await verifyPlatformRequest(req)
  if (!admin) return { error: NextResponse.json({ detail: 'Unauthorized' }, { status: 401 }) }
  return { admin }
}

/** Record a platform admin action. Never throws. */
export async function platformAudit(
  adminId: string,
  action: string,
  targetType: string | null,
  targetId: string | null,
  detail?: Prisma.InputJsonValue,
): Promise<void> {
  try {
    await prisma.platformAuditLog.create({ data: { adminId, action, targetType, targetId, detail } })
  } catch (err) {
    console.error('[platform-audit] failed', action, err)
  }
}
