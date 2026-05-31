/**
 * NoMealService — admin/manager bulk meal toggle with broadcast notification.
 * Separated from MealService because it operates on the entire mess,
 * not on a single member.
 *
 * /nomeal  → set all members' meal counts to 0 (ADMIN override)
 * /mealon  → restore all members to their personal preference defaults
 */

import type { MealRepository } from '../repositories/meal.repository'
import type { MemberRepository } from '../repositories/member.repository'
import type { PreferenceRepository } from '../repositories/preference.repository'
import type { TelegramSender } from '../infrastructure/sender'

export interface BulkMealResult {
  ok: boolean
  message: string
  membersUpdated: number
  notified: number
}

export class NoMealService {
  constructor(
    private readonly mealRepo: MealRepository,
    private readonly memberRepo: MemberRepository,
    private readonly prefRepo: PreferenceRepository,
    private readonly sender: TelegramSender,
  ) {}

  async disableAllMeals(
    messId: string,
    date: string,
    actorName: string,
    reason?: string,
  ): Promise<BulkMealResult> {
    const allMembers = await this.memberRepo.findAllActiveByMess(messId)

    // Set all meal counts to 0 (ADMIN override), including guests — a no-meal
    // day means nobody (members or guests) eats.
    await this.mealRepo.bulkUpsertLogs(
      allMembers.map((m) => m.id),
      messId,
      date,
      {
        breakfastCount: 0, lunchCount: 0, dinnerCount: 0,
        guestBreakfastCount: 0, guestLunchCount: 0, guestDinnerCount: 0,
      },
      'ADMIN',
    )

    // Notify linked members asynchronously (after DB commit)
    const reasonLine = reason ? `\n📝 *Reason:* ${reason}` : ''
    const broadcastMsg =
      `🚫 *No Meals — ${date}*\n\nAll meals have been turned *OFF* for ${date}.${reasonLine}\n\n_Posted by ${actorName}_\n_You can still turn your own meals back on with \`/meal on\` if needed._`

    const linked = allMembers.filter((m) => m.telegramLinked && m.telegramUid)
    const chatIds = linked.map((m) => Number(m.telegramUid))
    const { sent } = await this.sender.sendBulkMessages(chatIds, broadcastMsg)

    return {
      ok: true,
      message: `✅ Done!\n• All meals *OFF* for ${date}\n• ${allMembers.length} members updated\n• ${sent} notified via Telegram`,
      membersUpdated: allMembers.length,
      notified: sent,
    }
  }

  async enableAllMeals(
    messId: string,
    date: string,
    actorName: string,
  ): Promise<BulkMealResult> {
    const allMembers = await this.memberRepo.findAllActiveByMess(messId)
    const memberIds = allMembers.map((m) => m.id)

    // Restore each member to THEIR OWN default counts — not a blanket all-1.
    const prefsMap = await this.prefRepo.getBulkPreferences(memberIds, messId, date)
    await this.mealRepo.bulkRestoreFromPrefs(prefsMap, messId, date)

    const broadcastMsg =
      `✅ *Meals Restored — ${date}*\n\nMeals have been restored to your personal defaults for ${date}.\n\n_Posted by ${actorName}_\n_Adjust individually: \`/meal breakfast\` \`/meal lunch\` \`/meal dinner\`_`

    const linked = allMembers.filter((m) => m.telegramLinked && m.telegramUid)
    const chatIds = linked.map((m) => Number(m.telegramUid))
    const { sent } = await this.sender.sendBulkMessages(chatIds, broadcastMsg)

    return {
      ok: true,
      message: `✅ Done!\n• Meals restored to personal defaults for ${date}\n• ${allMembers.length} members updated\n• ${sent} notified via Telegram`,
      membersUpdated: allMembers.length,
      notified: sent,
    }
  }
}
