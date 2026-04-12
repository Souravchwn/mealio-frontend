/**
 * AccountLinkingService — OTP-based Telegram ↔ Mealio account pairing.
 *
 * Flow:
 *   1. /link +880XXXXXXXXXX  → generates OTP, sends it via Telegram DM
 *   2. /verify <otp>         → verifies OTP, persists link
 */

import type { OtpRepository } from '../repositories/otp.repository'
import type { MemberRepository } from '../repositories/member.repository'
import type { TelegramSender } from '../infrastructure/sender'

export interface LinkResult {
  ok: boolean
  message: string
  memberName?: string
}

export class AccountLinkingService {
  constructor(
    private readonly otpRepo: OtpRepository,
    private readonly memberRepo: MemberRepository,
    private readonly sender: TelegramSender,
  ) {}

  async initiateLink(telegramId: number, phone: string): Promise<LinkResult> {
    const member = await this.memberRepo.findByPhone(phone)
    if (!member) {
      return {
        ok: false,
        message: `❌ No active account found with phone \`${phone}\`.\n\nRegister at the Mealio web app first, then try again.`,
      }
    }

    const otp = await this.otpRepo.createOtp(telegramId, phone)

    // Send OTP directly to the user's private chat (telegramId = their private chat id)
    await this.sender.sendMessage(
      telegramId,
      `🔐 *Your Mealio verification code is:*\n\n\`${otp}\`\n\nSend \`/verify ${otp}\` to complete linking.\n_Expires in 5 minutes._`,
    )

    return {
      ok: true,
      message: `📱 OTP sent! Check your Telegram messages and reply with:\n\`/verify <code>\`\n\n_Code expires in 5 minutes._`,
    }
  }

  async verifyOtp(telegramId: number, otp: string): Promise<LinkResult> {
    const phone = await this.otpRepo.consumeOtp(telegramId, otp)
    if (!phone) {
      return {
        ok: false,
        message: `❌ Invalid or expired OTP.\n\nRequest a new one with \`/link <your-phone>\``,
      }
    }

    const member = await this.memberRepo.findByPhone(phone)
    if (!member) {
      return { ok: false, message: `❌ Account not found. Please register first.` }
    }

    await this.memberRepo.linkTelegram(member.id, telegramId)

    return {
      ok: true,
      memberName: member.name,
      message: `✅ *Linked! Welcome, ${member.name}!*\n\nYour Telegram is now connected to Mealio.\n\n*Available commands:*\n• \`/status\` — today's meal status\n• \`/meal on|off\` — toggle all meals\n• \`/meal breakfast|lunch|dinner\` — toggle a slot\n• \`/meal guest N\` — set guest count\n• \`/rate\` — current meal rate\n• \`/balance\` — your balance`,
    }
  }
}
