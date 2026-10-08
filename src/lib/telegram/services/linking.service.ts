/**
 * AccountLinkingService — Telegram ↔ Mealio account pairing.
 *
 * Flow:
 *   1. Member opens Settings in the web app → "Link Telegram" → gets a code
 *   2. Member sends `/link <code>` to the bot → account linked
 *
 * The code can only be obtained while logged in, so knowing someone's phone
 * number is no longer enough to take over their account.
 */

import type { OtpRepository } from '../repositories/otp.repository'
import type { MemberRepository } from '../repositories/member.repository'

export interface LinkResult {
  ok: boolean
  message: string
  memberName?: string
}

export class AccountLinkingService {
  constructor(
    private readonly otpRepo: OtpRepository,
    private readonly memberRepo: MemberRepository,
  ) {}

  async linkWithCode(telegramId: number, code: string): Promise<LinkResult> {
    const memberId = await this.otpRepo.consumeLinkCode(code, telegramId)
    if (!memberId) {
      return {
        ok: false,
        message: `❌ Invalid or expired code.\n\nOpen *Settings → Telegram* in the Mealio web app to get a new one.`,
      }
    }

    const member = await this.memberRepo.findActiveById(memberId)
    if (!member) {
      return { ok: false, message: `❌ This account is no longer active.` }
    }

    await this.memberRepo.linkTelegram(member.id, telegramId)

    return {
      ok: true,
      memberName: member.name,
      message: `✅ *Linked! Welcome, ${member.name}!*\n\nYour Telegram is now connected to Mealio.\n\n*Available commands:*\n• \`/status\`: today's meal status\n• \`/meal on|off\`: toggle all meals\n• \`/meal breakfast|lunch|dinner\`: toggle a slot\n• \`/meal guest N\`: set guest count\n• \`/rate\`: current meal rate\n• \`/balance\`: your balance`,
    }
  }
}
