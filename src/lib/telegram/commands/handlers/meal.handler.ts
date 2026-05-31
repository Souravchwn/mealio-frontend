/**
 * MealCommandHandler — handles /meal subcommands.
 *
 * Subcommands:
 *   /meal              — show today's status
 *   /meal on|off       — enable/disable the NEXT upcoming meal (time-based)
 *   /meal breakfast|lunch|dinner       — toggle a specific slot (count 0 ↔ defaultCount)
 *   /meal breakfast|lunch|dinner <N>   — set explicit count (0 to disable)
 *   /meal guest <slot> <N>             — set guests for a specific meal (billed to you)
 *   /meal guest <N>                    — set guests for the next upcoming meal
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
      await this.sender.sendMessage(ctx.chatId, `❌ Link your account first: \`/link <phone>\``)
      return
    }

    const { member } = ctx
    const timezone = ctx.group?.timezone ?? 'Asia/Dhaka'
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
        count = parseInt(rawCount, 10)
        if (isNaN(count) || count < 0) {
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

    // /meal guest <slot> <N>   or   /meal guest <N> (defaults to next meal)
    if (sub === 'guest') {
      let slot: Slot
      let rawCount: string | undefined

      const maybeSlot = ctx.args[1]?.toLowerCase()
      if (maybeSlot && VALID_SLOTS.has(maybeSlot)) {
        slot = maybeSlot as Slot
        rawCount = ctx.args[2]
      } else {
        // No slot given — default to the current target meal (next by time)
        const target = await this.mealConfigRepo.getTargetMeal(member.messId, timezone)
        if (!target) {
          await this.sender.sendMessage(
            ctx.chatId,
            `⏰ All meal cut-off times have passed. Specify a slot: \`/meal guest dinner 2\`.`,
          )
          return
        }
        slot = target.mealType.toLowerCase() as Slot
        rawCount = ctx.args[1]
      }

      const count = parseInt(rawCount ?? '', 10)
      if (isNaN(count) || count < 0) {
        await this.sender.sendMessage(
          ctx.chatId,
          `❌ Invalid guest count. Usage: \`/meal guest dinner 2\` (use 0 to clear)`,
        )
        return
      }

      // Enforce the named slot's cutoff (and that it's enabled)
      const config = await this.mealConfigRepo.getMealConfig(member.messId, SLOT_UPPER[slot])
      if (!config || !config.enabled) {
        const label = slot.charAt(0).toUpperCase() + slot.slice(1)
        await this.sender.sendMessage(ctx.chatId, `🚫 *${label}* is not available for guests.`)
        return
      }
      const cutoffPassed = await this.mealConfigRepo.isCutoffPassed(member.messId, SLOT_UPPER[slot], timezone)
      if (cutoffPassed) {
        const label = slot.charAt(0).toUpperCase() + slot.slice(1)
        await this.sender.sendMessage(
          ctx.chatId,
          `⏰ Cut-off time for *${label}* has passed. Cannot update guests for this meal.`,
        )
        return
      }

      const result = await this.mealService.setGuestCount(member.id, member.messId, today, slot, count)
      await this.sender.sendMessage(ctx.chatId, result.message)
      return
    }

    await this.sender.sendMessage(
      ctx.chatId,
      `❓ Unknown meal sub-command.\n\n*Usage:*\n\`/meal on\` — enable next meal (auto-detected by time)\n\`/meal off\` — disable next meal (auto-detected by time)\n\`/meal breakfast\` \`/meal lunch\` \`/meal dinner\` — toggle a specific slot\n\`/meal lunch 2\` — set explicit count (0 to disable)\n\`/meal guest dinner 2\` — set guests for a specific meal`,
    )
  }
}

function localDate(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date())
}
