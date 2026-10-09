/**
 * POST /api/admin/telegram-group/code
 * Issues a one-time code the admin sends inside the house group as `/linkgroup <code>`.
 * Replaces hunting for a Telegram chat id. Admin only, 10 minutes, single use.
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { OtpRepository } from '@/lib/telegram/repositories/otp.repository'
import { checkRateLimit } from '@/lib/rate-limit'
import { prisma } from '@/lib/prisma'

const otpRepo = new OtpRepository()

export async function POST(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'ADMIN') return NextResponse.json({ detail: 'Admin only' }, { status: 403 })

  const rate = await checkRateLimit('tg-group-code', payload.sub, 10, 60 * 60 * 1000)
  if (!rate.allowed) return NextResponse.json({ detail: 'Too many codes requested. Try again later.' }, { status: 429 })

  try {
    const admin = await prisma.member.findUnique({ where: { id: payload.sub }, select: { telegramLinked: true } })
    const { code, expiresAt } = await otpRepo.createGroupCode(payload.sub, payload.messId)
    return NextResponse.json({
      code,
      expires_at: expiresAt.toISOString(),
      bot_username: process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? null,
      // The bot only accepts /linkgroup from an admin whose own Telegram is linked
      admin_telegram_linked: !!admin?.telegramLinked,
    })
  } catch (err) {
    console.error('[POST /api/admin/telegram-group/code]', err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
