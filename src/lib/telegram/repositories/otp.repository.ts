/**
 * OtpRepository — one-time Telegram link codes.
 *
 * Codes are issued by the web app to a LOGGED-IN member (so possession of the
 * code proves account ownership) and redeemed in the bot with `/link <code>`.
 * Codes are single-use and expire after TELEGRAM_LINK_CODE_TTL_MINUTES.
 */

import { prisma } from '@/lib/prisma'
import { randomInt } from 'crypto'
import { TELEGRAM_LINK_CODE_TTL_MINUTES } from '@/lib/constants'

/** No 0/O/1/I to avoid typos. 8 chars ≈ 10^12 combinations. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 8

function generateCode(): string {
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)]
  return code
}

export function normalizeLinkCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export class OtpRepository {
  /** Issue a fresh code for a member, invalidating their previous unused codes. */
  async createLinkCode(memberId: string): Promise<{ code: string; expiresAt: Date }> {
    const code = generateCode()
    const expiresAt = new Date(Date.now() + TELEGRAM_LINK_CODE_TTL_MINUTES * 60 * 1000)

    await prisma.$transaction([
      prisma.telegramOtp.updateMany({ where: { memberId, used: false }, data: { used: true } }),
      prisma.telegramOtp.create({ data: { memberId, otp: code, expiresAt } }),
    ])

    return { code, expiresAt }
  }

  /** Atomically mark a valid code as used and return its member id. */
  async consumeLinkCode(rawCode: string, telegramId: number): Promise<string | null> {
    const code = normalizeLinkCode(rawCode)
    if (code.length !== CODE_LENGTH) return null

    const row = await prisma.telegramOtp.findFirst({
      where: { otp: code, used: false, memberId: { not: null }, expiresAt: { gt: new Date() } },
      select: { id: true, memberId: true },
    })
    if (!row?.memberId) return null

    // Conditional update: only one concurrent redeem can win
    const claimed = await prisma.telegramOtp.updateMany({
      where: { id: row.id, used: false },
      data: { used: true, telegramId: String(telegramId) },
    })
    return claimed.count === 1 ? row.memberId : null
  }
}
