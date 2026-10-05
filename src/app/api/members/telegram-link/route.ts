/**
 * /api/members/telegram-link
 *
 * GET    — is the current member's Telegram linked?
 * POST   — issue a one-time link code; the member sends `/link <code>` to the bot.
 * DELETE — unlink Telegram from the current member.
 *
 * Codes can only be issued to a logged-in member, which is what makes the
 * bot link secure (the old flow trusted any phone number typed into the bot).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { OtpRepository } from '@/lib/telegram/repositories/otp.repository'
import { checkRateLimit } from '@/lib/rate-limit'

const otpRepo = new OtpRepository()

export async function GET(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  const member = await prisma.member.findUnique({
    where: { id: payload.sub },
    select: { telegramLinked: true },
  })
  return NextResponse.json({
    linked: !!member?.telegramLinked,
    bot_username: process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? null,
  })
}

export async function POST(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  const rate = await checkRateLimit('tg-link-code', payload.sub, 10, 60 * 60 * 1000)
  if (!rate.allowed) {
    return NextResponse.json({ detail: 'Too many codes requested. Try again later.' }, { status: 429 })
  }

  try {
    const { code, expiresAt } = await otpRepo.createLinkCode(payload.sub)
    return NextResponse.json({
      code,
      expires_at: expiresAt.toISOString(),
      bot_username: process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? null,
    })
  } catch (err) {
    console.error('[POST /api/members/telegram-link] member=%s', payload.sub, err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  try {
    await prisma.member.update({
      where: { id: payload.sub },
      data: { telegramUid: null, telegramLinked: false },
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[DELETE /api/members/telegram-link] member=%s', payload.sub, err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
