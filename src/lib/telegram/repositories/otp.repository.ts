/**
 * OtpRepository — manages short-lived OTPs for the /link → /verify flow.
 * OTPs expire after OTP_TTL_MINUTES and are single-use.
 */

import { prisma } from '@/lib/prisma'
import { randomInt } from 'crypto'

const OTP_TTL_MINUTES = 5

function generateOtp(): string {
  return String(randomInt(100_000, 999_999))
}

export class OtpRepository {
  async createOtp(telegramId: number, phone: string): Promise<string> {
    const otp = generateOtp()
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000)

    // Invalidate any existing unused OTP for this telegram user
    await prisma.telegramOtp.updateMany({
      where: { telegramId: String(telegramId), used: false },
      data: { used: true },
    })

    await prisma.telegramOtp.create({
      data: { telegramId: String(telegramId), phone, otp, expiresAt },
    })

    return otp
  }

  async consumeOtp(telegramId: number, otp: string): Promise<string | null> {
    const row = await prisma.telegramOtp.findFirst({
      where: {
        telegramId: String(telegramId),
        otp,
        used: false,
        expiresAt: { gt: new Date() },
      },
      select: { id: true, phone: true },
    })

    if (!row) return null

    await prisma.telegramOtp.update({ where: { id: row.id }, data: { used: true } })
    return row.phone
  }
}
