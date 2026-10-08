/**
 * POST /api/auth/forgot { email, locale }
 * Emails a reset link when email is configured. The response is the same
 * whether or not the email exists, so it cannot be used to discover accounts.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { clientIp } from '@/lib/auth-utils'
import { checkRateLimit } from '@/lib/rate-limit'
import { isEmailEnabled } from '@/lib/email'
import { sendResetEmail } from '@/lib/account-emails'
import { logSecurityEvent } from '@/lib/security-events'

export async function POST(req: NextRequest) {
  const ip = clientIp(req)
  let body: { email?: unknown; locale?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ detail: 'Invalid request body' }, { status: 400 })
  }
  if (typeof body.email !== 'string' || !body.email.includes('@')) {
    return NextResponse.json({ detail: 'Please enter your email address' }, { status: 400 })
  }
  const email = body.email.toLowerCase().trim()

  const rate = await checkRateLimit('forgot', `${ip}|${email}`, 5, 60 * 60 * 1000)
  if (!rate.allowed) {
    return NextResponse.json({ detail: 'Too many requests. Try again later.', code: 'RATE_LIMITED' }, { status: 429 })
  }

  if (!isEmailEnabled()) {
    return NextResponse.json({ ok: true, email_enabled: false })
  }

  try {
    const member = await prisma.member.findUnique({
      where: { email },
      select: { id: true, name: true, deletedAt: true },
    })
    if (member && !member.deletedAt) {
      await sendResetEmail(member.id, email, member.name, body.locale === 'bn' ? 'bn' : 'en')
      await logSecurityEvent({ type: 'PASSWORD_RESET_REQUESTED', ip, email, memberId: member.id })
    }
    return NextResponse.json({ ok: true, email_enabled: true })
  } catch (err) {
    console.error('[POST /api/auth/forgot]', err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
