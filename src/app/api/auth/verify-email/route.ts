/** POST /api/auth/verify-email { token }: confirm an email address from the emailed link. */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { findValidToken } from '@/lib/account-emails'
import { logSecurityEvent } from '@/lib/security-events'

export async function POST(req: NextRequest) {
  let body: { token?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ detail: 'Invalid request body' }, { status: 400 })
  }
  if (typeof body.token !== 'string' || !body.token) {
    return NextResponse.json({ detail: 'Missing token' }, { status: 400 })
  }
  try {
    const row = await findValidToken(body.token, 'VERIFY_EMAIL')
    if (!row) {
      return NextResponse.json({ detail: 'This link is invalid or has expired.', code: 'INVALID_TOKEN' }, { status: 400 })
    }
    await prisma.$transaction([
      prisma.member.update({ where: { id: row.memberId }, data: { emailVerifiedAt: new Date() } }),
      prisma.authToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    ])
    await logSecurityEvent({ type: 'EMAIL_VERIFIED', memberId: row.memberId })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[POST /api/auth/verify-email]', err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
