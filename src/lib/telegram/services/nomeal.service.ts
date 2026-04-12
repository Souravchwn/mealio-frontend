/**
 * NoMealService — admin/manager bulk meal toggle with broadcast notification.
 * Separated from MealService because it operates on the entire mess,
 * not on a single member.
 */

import type { MealRepository } from '../repositories/meal.repository'
import type { MemberRepository } from '../repositories/member.repository'
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
    private readonly sender: TelegramSender,
  ) {}

  async disableAllMeals(
    messId: string,
    date: string,
    actorName: string,
    reason?: string,
  ): Promise<BulkMealResult> {
    const allMembers = await this.memberRepo.findAllActiveByMess(messId)

    await this.mealRepo.bulkUpsertLogs(
      allMembers.map((m) => m.id),
      messId,
      date,
      { breakfast: false, lunch: false, dinner: false },
    )

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

    await this.mealRepo.bulkUpsertLogs(
      allMembers.map((m) => m.id),
      messId,
      date,
      { breakfast: true, lunch: true, dinner: true },
    )

    const broadcastMsg =
      `✅ *Meals Restored — ${date}*\n\nAll meals are back *ON* for ${date}.\n\n_Posted by ${actorName}_\n_Adjust individually: \`/meal breakfast\` \`/meal lunch\` \`/meal dinner\`_`

    const linked = allMembers.filter((m) => m.telegramLinked && m.telegramUid)
    const chatIds = linked.map((m) => Number(m.telegramUid))
    const { sent } = await this.sender.sendBulkMessages(chatIds, broadcastMsg)

    return {
      ok: true,
      message: `✅ Done!\n• All meals *ON* for ${date}\n• ${allMembers.length} members updated\n• ${sent} notified via Telegram`,
      membersUpdated: allMembers.length,
      notified: sent,
    }
  }
}
