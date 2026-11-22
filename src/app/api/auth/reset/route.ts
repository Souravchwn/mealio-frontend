/**
 * POST /api/auth/reset
 *   { token, password }          from an emailed link
 *   { email, code, password }    code given by the mess admin or support
 * Setting a new password signs the account out everywhere.
 */

import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { clientIp } from '@/lib/auth-utils'
import { checkRateLimit } from '@/lib/rate-limit'
import { findValidToken } from '@/lib/account-emails'
import { normalizeCode } from '@/lib/tokens'
import { logSecurityEvent } from '@/lib/security-events'

export async function POST(req: NextRequest) {
  const ip = clientIp(req)
  const rate = await checkRateLimit('reset', ip, 10, 60 * 60 * 1000)
  if (!rate.allowed) {
    await logSecurityEvent({ type: 'RATE_LIMITED', severity: 'WARN', ip, detail: { route: 'reset' } })
    return NextResponse.json({ detail: 'Too many attempts. Try again later.', code: 'RATE_LIMITED' }, { status: 429 })
  }

  let body: { token?: unknown; email?: unknown; code?: unknown; password?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ detail: 'Invalid request body' }, { status: 400 })
  }
  if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 128) {
    return NextResponse.json({ detail: 'Password must be at least 8 characters' }, { status: 400 })
  }

  try {
    let tokenRow: Awaited<ReturnType<typeof findValidToken>> = null
    if (typeof body.token === 'string' && body.token) {
      tokenRow = await findValidToken(body.token, 'RESET')
    } else if (typeof body.email === 'string' && typeof body.code === 'string') {
      const member = await prisma.member.findUnique({
        where: { email: body.email.toLowerCase().trim() },
        select: { id: true },
      })
      if (member) tokenRow = await findValidToken(normalizeCode(body.code), 'RESET', member.id)
    }
    if (!tokenRow) {
      await logSecurityEvent({
        type: 'PASSWORD_RESET_FAILED',
        severity: 'WARN',
        ip,
        email: typeof body.email === 'string' ? body.email.toLowerCase().trim() : null,
      })
      return NextResponse.json(
        { detail: 'This reset link or code is invalid or has expired.', code: 'INVALID_TOKEN' },
        { status: 400 },
      )
    }

    const passwordHash = await bcrypt.hash(body.password, 10)
    await prisma.$transaction([
      prisma.member.update({
        where: { id: tokenRow.memberId },
        data: { passwordHash, passwordChangedAt: new Date() },
      }),
      // The emailed code and link are one reset: using either cancels both (and any admin code)
      prisma.authToken.updateMany({ where: { memberId: tokenRow.memberId, purpose: 'RESET', usedAt: null }, data: { usedAt: new Date() } }),
    ])
    await logSecurityEvent({ type: 'PASSWORD_RESET', ip, memberId: tokenRow.memberId, detail: { ok: true } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[POST /api/auth/reset]', err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
