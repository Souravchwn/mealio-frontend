/**
 * POST /api/me/password { current_password, new_password }
 * Signs out every other device (tokens issued before now stop working);
 * returns a fresh token for this device.
 */

import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken, signToken } from '@/lib/auth-utils'
import { checkRateLimit } from '@/lib/rate-limit'
import { logSecurityEvent } from '@/lib/security-events'

export async function POST(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  const rate = await checkRateLimit('change-password', payload.sub, 5, 60 * 60 * 1000)
  if (!rate.allowed) return NextResponse.json({ detail: 'Too many attempts. Try again later.', code: 'RATE_LIMITED' }, { status: 429 })

  let body: { current_password?: unknown; new_password?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ detail: 'Invalid request body' }, { status: 400 })
  }
  if (typeof body.new_password !== 'string' || body.new_password.length < 8 || body.new_password.length > 128) {
    return NextResponse.json({ detail: 'New password must be at least 8 characters' }, { status: 400 })
  }

  try {
    const me = await prisma.member.findUnique({ where: { id: payload.sub }, select: { passwordHash: true } })
    if (!me || typeof body.current_password !== 'string' || !(await bcrypt.compare(body.current_password, me.passwordHash))) {
      return NextResponse.json({ detail: 'Your current password is not correct.' }, { status: 400 })
    }
    // Stamp a second earlier than the new token so this device stays signed in
    const changedAt = new Date(Date.now() - 2000)
    await prisma.member.update({
      where: { id: payload.sub },
      data: { passwordHash: await bcrypt.hash(body.new_password, 10), passwordChangedAt: changedAt },
    })
    await logSecurityEvent({ type: 'PASSWORD_RESET', memberId: payload.sub, messId: payload.messId, detail: { via: 'settings' } })
    const fresh = await signToken({ sub: payload.sub, messId: payload.messId, role: payload.role })
    return NextResponse.json({ ok: true, access_token: fresh })
  } catch (err) {
    console.error('[POST /api/me/password]', err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
