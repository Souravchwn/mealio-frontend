/**
 * MealCommandHandler — handles /meal subcommands.
 *
 * Subcommands:
 *   /meal              — show today's status
 *   /meal on|off       — enable/disable the NEXT upcoming meal (time-based)
 *   /meal breakfast|lunch|dinner       — toggle a specific slot (count 0 ↔ defaultCount)
 *   /meal breakfast|lunch|dinner <N>   — set explicit count (0 to disable)
 *   /meal guest <N>    — guests for the next open meal (/meal guest dinner 2 for one meal)
 *
 * Cutoff enforcement lives here (via MealConfigRepository), not in MealService.
 */

import type { CommandHandler } from '../types'
import type { CommandContext } from '../../dto'
import { MealType } from '../../dto'
import type { MealService } from '../../services/meal.service'
import type { MealConfigRepository } from '../../repositories/meal-config.repository'
import type { PreferenceRepository } from '../../repositories/preference.repository'
import type { TelegramSender } from '../../infrastructure/sender'

type Slot = 'breakfast' | 'lunch' | 'dinner'

const VALID_SLOTS = new Set<string>([MealType.BREAKFAST, MealType.LUNCH, MealType.DINNER])

const SLOT_UPPER: Record<Slot, string> = {
  breakfast: 'BREAKFAST',
  lunch:     'LUNCH',
  dinner:    'DINNER',
}

export class MealCommandHandler implements CommandHandler {
  constructor(
    private readonly mealService: MealService,
    private readonly mealConfigRepo: MealConfigRepository,
    private readonly prefRepo: PreferenceRepository,
    private readonly sender: TelegramSender,
  ) {}

  supports(command: string): boolean {
    return command === '/meal'
  }

  async handle(ctx: CommandContext): Promise<void> {
    if (!ctx.member) {
      await this.sender.sendMessage(ctx.chatId, `❌ Link your account first. Send \`/link\` to see how.`)
      return
    }

    const { member } = ctx
    const timezone = ctx.timezone
    const today = localDate(timezone)

    const sub = ctx.args[0]?.toLowerCase()

    // /meal — show status
    if (!sub) {
      const result = await this.mealService.getStatus(member.id, member.messId, today)
      await this.sender.sendMessage(ctx.chatId, result.message)
      return
    }

    // /meal on|off — time-based smart targeting
    if (sub === 'on' || sub === 'off') {
      const target = await this.mealConfigRepo.getTargetMeal(member.messId, timezone)
      if (!target) {
        await this.sender.sendMessage(
          ctx.chatId,
          `⏰ All meal cut-off times have passed. No more meals to toggle for today.\n\nUse \`/meal breakfast\`, \`/meal lunch\`, or \`/meal dinner\` to toggle a specific slot explicitly.`,
        )
        return
      }

      const slot = target.mealType.toLowerCase() as Slot
      let count: number

      if (sub === 'off') {
        count = 0
      } else {
        // Restore to preference default count
        const prefs = await this.prefRepo.getMemberPreferences(member.id, member.messId, today)
        const key = `${slot}Count` as 'breakfastCount' | 'lunchCount' | 'dinnerCount'
        count = prefs[key] > 0 ? prefs[key] : 1
      }

      const result = await this.mealService.setSlotCount(member.id, member.messId, today, slot, count, 'USER')
      await this.sender.sendMessage(ctx.chatId, result.message)
      return
    }

    // /meal breakfast|lunch|dinner [count]
    if (VALID_SLOTS.has(sub)) {
      const slot = sub as Slot
      const rawCount = ctx.args[1]

      // Cutoff check for this specific slot
      const cutoffPassed = await this.mealConfigRepo.isCutoffPassed(member.messId, SLOT_UPPER[slot], timezone)
      if (cutoffPassed) {
        const label = slot.charAt(0).toUpperCase() + slot.slice(1)
        await this.sender.sendMessage(
          ctx.chatId,
          `⏰ Cut-off time for *${label}* has passed. Cannot change this meal.`,
        )
        return
      }

      let count: number
      if (rawCount !== undefined) {
        // Explicit count: /meal lunch 3
        count = Number(rawCount)
        if (!Number.isInteger(count) || count < 0) {
          await this.sender.sendMessage(
            ctx.chatId,
            `❌ Invalid count. Usage: \`/meal ${slot} 2\` (use 0 to disable)`,
          )
          return
        }
      } else {
        // Toggle: if currently > 0 → turn off; if 0 → restore to defaultCount
        const currentCount = await this.mealService.getSlotCount(member.id, member.messId, today, slot)

        if (currentCount > 0) {
          count = 0
        } else {
          const prefs = await this.prefRepo.getMemberPreferences(member.id, member.messId, today)
          const prefKey = `${slot}Count` as 'breakfastCount' | 'lunchCount' | 'dinnerCount'
          count = prefs[prefKey] > 0 ? prefs[prefKey] : 1
        }
      }

      const result = await this.mealService.setSlotCount(member.id, member.messId, today, slot, count, 'USER')
      await this.sender.sendMessage(ctx.chatId, result.message)
      return
    }

    // /meal guest <N> (the next open meal)  or  /meal guest <breakfast|lunch|dinner> <N>
    if (sub === 'guest') {
      const named = (ctx.args[1] ?? '').toLowerCase()
      const explicit = named === 'breakfast' || named === 'lunch' || named === 'dinner' ? named : null
      const count = parseInt(ctx.args[explicit ? 2 : 1] ?? '', 10)

      let slot: 'breakfast' | 'lunch' | 'dinner'
      if (explicit) {
        // Each meal's guests can change until that meal's cutoff
        if (await this.mealConfigRepo.isCutoffPassed(member.messId, explicit.toUpperCase(), timezone)) {
          await this.sender.sendMessage(ctx.chatId, `⏰ The ${explicit} cut-off has passed. Its guests can no longer change.`)
          return
        }
        slot = explicit
      } else {
        const target = await this.mealConfigRepo.getTargetMeal(member.messId, timezone)
        if (!target) {
          await this.sender.sendMessage(ctx.chatId, `⏰ All meal cut-off times have passed. Cannot update guests.`)
          return
        }
        slot = target.mealType.toLowerCase() as 'breakfast' | 'lunch' | 'dinner'
      }

      const result = await this.mealService.setGuestCount(member.id, member.messId, today, slot, count)
      await this.sender.sendMessage(ctx.chatId, result.message)
      return
    }

    await this.sender.sendMessage(
      ctx.chatId,
      `❓ Unknown meal sub-command.\n\n*Usage:*\n\`/meal on\`: enable next meal (auto-detected by time)\n\`/meal off\`: disable next meal (auto-detected by time)\n\`/meal breakfast\` \`/meal lunch\` \`/meal dinner\`: toggle a specific slot\n\`/meal lunch 2\`: set explicit count (0 to disable)\n\`/meal guest N\`: guests for the next meal (\`/meal guest dinner 2\` for one meal)`,
    )
  }
}

function localDate(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date())
}
