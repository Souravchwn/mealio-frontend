/**
 * MealService — individual meal slot management for members.
 *
 * Cutoff enforcement is the HANDLER's responsibility (via MealConfigRepository).
 * This service only checks frozen state and writes to the database.
 *
 * Count semantics: 0 = skip, 1 = normal, 2+ = extra/family
 */

import type { MealRepository } from '../repositories/meal.repository'

export interface MealActionResult {
  ok: boolean
  message: string
}

type Slot = 'breakfast' | 'lunch' | 'dinner'

const SLOT_FIELD: Record<Slot, 'breakfastCount' | 'lunchCount' | 'dinnerCount'> = {
  breakfast: 'breakfastCount',
  lunch: 'lunchCount',
  dinner: 'dinnerCount',
}

const SLOT_EMOJI: Record<Slot, string> = {
  breakfast: '🍳',
  lunch: '🍱',
  dinner: '🌙',
}

export class MealService {
  constructor(private readonly mealRepo: MealRepository) { }

  /**
   * Set a specific meal slot to the given count.
   * count=0  → meal is OFF
   * count≥1  → meal is ON (1=normal, 2+=extra)
   * overrideType: USER (member command), ADMIN (admin command), SYSTEM (cron)
   */
  async setSlotCount(
    memberId: string,
    messId: string,
    date: string,
    slot: Slot,
    count: number,
    overrideType: 'USER' | 'ADMIN' | 'SYSTEM',
  ): Promise<MealActionResult> {
    const log = await this.mealRepo.upsertLog(memberId, messId, date, {})
    if (log.frozen) return { ok: false, message: `🔒 Today's meals are frozen and cannot be changed.` }

    const field = SLOT_FIELD[slot]
    await this.mealRepo.updateLog(log.id, {
      [field]: count,
      isOverride: true,
      overrideType,
    })

    const emoji = SLOT_EMOJI[slot]
    const label = slot.charAt(0).toUpperCase() + slot.slice(1)

    if (count === 0) {
      return { ok: true, message: `${emoji} *${label}* turned *OFF* ❌` }
    }
    if (count === 1) {
      return { ok: true, message: `${emoji} *${label}* turned *ON* ✅` }
    }
    return { ok: true, message: `${emoji} *${label}* set to *×${count}* ✅` }
  }

  async setGuestCount(
    memberId: string,
    messId: string,
    date: string,
    count: number,
  ): Promise<MealActionResult> {
    if (count < 0 || isNaN(count)) {
      return { ok: false, message: `❌ Invalid guest count. Usage: \`/meal guest 2\`` }
    }

    const log = await this.mealRepo.upsertLog(memberId, messId, date, {})
    if (log.frozen) return { ok: false, message: `🔒 Today's meals are frozen.` }

    await this.mealRepo.updateLog(log.id, { guestCount: count })
    return { ok: true, message: `👥 Guest count set to *${count}*` }
  }

  /** Fetch raw log counts — used by the handler for toggle-without-count logic. */
  async getSlotCount(
    memberId: string,
    messId: string,
    date: string,
    slot: Slot,
  ): Promise<number> {
    const log = await this.mealRepo.findLog(memberId, messId, date)
    if (!log) return 1 // default: assume ON
    return log[SLOT_FIELD[slot]]
  }

  async getStatus(memberId: string, messId: string, date: string): Promise<MealActionResult> {
    const log = await this.mealRepo.findLog(memberId, messId, date)
    if (!log) {
      return {
        ok: true,
        message: `📋 No log for today (${date}). All meals are *ON* by default.\n\n🍳 Breakfast: ✅ ON\n🍱 Lunch: ✅ ON\n🌙 Dinner: ✅ ON`,
      }
    }

    function fmtSlot(emoji: string, label: string, count: number): string {
      if (count === 0) return `${emoji} ${label}: ❌ OFF`
      if (count === 1) return `${emoji} ${label}: ✅ ON`
      return `${emoji} ${label}: ✅ ON (×${count})`
    }

    const lines = [
      `📅 *Today's Meals — ${date}*`,
      fmtSlot('🍳', 'Breakfast', log.breakfastCount),
      fmtSlot('🍱', 'Lunch', log.lunchCount),
      fmtSlot('🌙', 'Dinner', log.dinnerCount),
      `👥 Guests: ${log.guestCount}`,
      log.frozen ? '\n🔒 _This day is frozen_' : '',
    ].filter(Boolean).join('\n')

    return { ok: true, message: lines }
  }
}
