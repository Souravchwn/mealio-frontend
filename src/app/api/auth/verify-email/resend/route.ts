/** POST /api/auth/verify-email/resend: send the confirmation link again (signed in). */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { checkRateLimit } from '@/lib/rate-limit'
import { isEmailEnabled } from '@/lib/email'
import { sendVerificationEmail } from '@/lib/account-emails'

export async function POST(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  if (!isEmailEnabled()) {
    return NextResponse.json({ detail: 'Email is not set up yet.', code: 'EMAIL_DISABLED' }, { status: 400 })
  }

  const rate = await checkRateLimit('verify-resend', payload.sub, 3, 60 * 60 * 1000)
  if (!rate.allowed) {
    return NextResponse.json({ detail: 'Please wait before asking again.', code: 'RATE_LIMITED' }, { status: 429 })
  }

  const member = await prisma.member.findUnique({
    where: { id: payload.sub },
    select: { email: true, name: true, emailVerifiedAt: true },
  })
  if (!member) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  if (member.emailVerifiedAt) return NextResponse.json({ ok: true, already_verified: true })

  let body: { locale?: unknown } = {}
  try {
    body = await req.json()
  } catch {
    /* optional body */
  }
  await sendVerificationEmail(payload.sub, member.email, member.name, body.locale === 'bn' ? 'bn' : 'en')
  return NextResponse.json({ ok: true })
}
