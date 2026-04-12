/**
 * MealService — individual meal toggling for members.
 * Enforces timezone-aware cutoff time; validates frozen state.
 */

import type { MealRepository } from '../repositories/meal.repository'
import type { MealType } from '../dto'

export interface MealActionResult {
  ok: boolean
  message: string
}

export class MealService {
  constructor(private readonly mealRepo: MealRepository) {}

  /**
   * Returns the current local time in HH:MM in the given timezone.
   * Uses the built-in Intl API — no external dependency needed.
   */
  private localTime(timezone: string): string {
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone,
      hour12: false,
    }).format(new Date())
  }

  private isCutoffPassed(cutoffTime: string, timezone: string): boolean {
    const now = this.localTime(timezone) // "HH:MM"
    return now >= cutoffTime
  }

  async toggleAll(
    memberId: string,
    messId: string,
    date: string,
    value: boolean,
    cutoffTime: string,
    timezone: string,
  ): Promise<MealActionResult> {
    if (this.isCutoffPassed(cutoffTime, timezone)) {
      return { ok: false, message: `⏰ Cut-off time (${cutoffTime}) has passed. Cannot change meals.` }
    }

    const log = await this.mealRepo.upsertLog(memberId, messId, date, {})
    if (log.frozen) return { ok: false, message: `🔒 Today's meals are frozen and cannot be changed.` }

    await this.mealRepo.updateLog(log.id, { breakfast: value, lunch: value, dinner: value })

    return {
      ok: true,
      message: value
        ? `✅ All meals turned *ON* for today.\n🍳 Breakfast · 🍱 Lunch · 🌙 Dinner`
        : `❌ All meals turned *OFF* for today.`,
    }
  }

  async toggleSlot(
    memberId: string,
    messId: string,
    date: string,
    slot: MealType,
    cutoffTime: string,
    timezone: string,
  ): Promise<MealActionResult> {
    if (this.isCutoffPassed(cutoffTime, timezone)) {
      return { ok: false, message: `⏰ Cut-off time (${cutoffTime}) has passed. Cannot change meals.` }
    }

    const log = await this.mealRepo.upsertLog(memberId, messId, date, {})
    if (log.frozen) return { ok: false, message: `🔒 Today's meals are frozen.` }

    const current = log[slot as 'breakfast' | 'lunch' | 'dinner']
    const newVal = !current
    await this.mealRepo.updateLog(log.id, { [slot]: newVal })

    const emoji = slot === 'breakfast' ? '🍳' : slot === 'lunch' ? '🍱' : '🌙'
    const label = slot.charAt(0).toUpperCase() + slot.slice(1)
    return {
      ok: true,
      message: `${emoji} *${label}* turned ${newVal ? '*ON* ✅' : '*OFF* ❌'}`,
    }
  }

  async setGuestCount(
    memberId: string,
    messId: string,
    date: string,
    count: number,
    cutoffTime: string,
    timezone: string,
  ): Promise<MealActionResult> {
    if (this.isCutoffPassed(cutoffTime, timezone)) {
      return { ok: false, message: `⏰ Cut-off time (${cutoffTime}) has passed.` }
    }
    if (count < 0 || isNaN(count)) {
      return { ok: false, message: `❌ Invalid guest count. Usage: \`/meal guest 2\`` }
    }

    const log = await this.mealRepo.upsertLog(memberId, messId, date, {})
    if (log.frozen) return { ok: false, message: `🔒 Today's meals are frozen.` }

    await this.mealRepo.updateLog(log.id, { guestCount: count })
    return { ok: true, message: `👥 Guest count set to *${count}*` }
  }

  async getStatus(memberId: string, messId: string, date: string): Promise<MealActionResult> {
    const log = await this.mealRepo.findLog(memberId, messId, date)
    if (!log) {
      return { ok: true, message: `📋 No log for today (${date}). All meals are *ON* by default.` }
    }

    const lines = [
      `📅 *Today's Meals — ${date}*`,
      `🍳 Breakfast: ${log.breakfast ? '✅ ON' : '❌ OFF'}`,
      `🍱 Lunch: ${log.lunch ? '✅ ON' : '❌ OFF'}`,
      `🌙 Dinner: ${log.dinner ? '✅ ON' : '❌ OFF'}`,
      `👥 Guests: ${log.guestCount}`,
      log.frozen ? '\n🔒 _This day is frozen_' : '',
    ].filter(Boolean).join('\n')

    return { ok: true, message: lines }
  }
}
