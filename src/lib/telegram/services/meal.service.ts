/**
 * MealService — individual meal slot management for members.
 *
 * Cutoff enforcement is the HANDLER's responsibility (via MealConfigRepository).
 * This service only checks frozen state and writes to the database.
 *
 * Count semantics: 0 = skip, 1 = normal, 2+ = extra/family
 */

import { MAX_GUEST_COUNT, type MealTypeUpper } from '@/lib/constants'
import { ensureDailyLogs } from '@/lib/daily-logs'
import { getMessSettings } from '@/lib/mess-settings'
import { setSlotGuestsData, slotGuests, type GuestSlot } from '@/lib/guests'
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
    // Same limits as the web app: mess-wide meal switch and max portions
    const settings = await getMessSettings(messId)
    const meal = settings?.meals[slot.toUpperCase() as MealTypeUpper]
    if (meal && count > 0 && !meal.enabled) {
      return { ok: false, message: `❌ This meal is turned off for the mess.` }
    }
    if (!Number.isInteger(count) || count < 0 || (meal && count > meal.maxCount)) {
      return { ok: false, message: `❌ Count must be from 0 to ${meal?.maxCount ?? 10}.` }
    }

    // Make sure today's log exists from the member's defaults before editing it
    await ensureDailyLogs(messId)
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

  /** Guests for ONE meal (a guest can come for lunch only, dinner only, or both). */
  async setGuestCount(
    memberId: string,
    messId: string,
    date: string,
    slot: GuestSlot,
    count: number,
  ): Promise<MealActionResult> {
    if (!Number.isInteger(count) || count < 0 || count > MAX_GUEST_COUNT) {
      return { ok: false, message: `❌ Guest count must be from 0 to ${MAX_GUEST_COUNT}. Usage: \`/meal guest 2\`` }
    }

    await ensureDailyLogs(messId)
    const log = await this.mealRepo.upsertLog(memberId, messId, date, {})
    if (log.frozen) return { ok: false, message: `🔒 Today's meals are frozen.` }

    await this.mealRepo.updateLog(log.id, setSlotGuestsData(log, slot, count))
    const label = slot.charAt(0).toUpperCase() + slot.slice(1)
    return { ok: true, message: `👥 *${label}* guests: *${count}*` }
  }

  /** Fetch raw log counts — used by the handler for toggle-without-count logic. */
  async getSlotCount(
    memberId: string,
    messId: string,
    date: string,
    slot: Slot,
  ): Promise<number> {
    await ensureDailyLogs(messId)
    const log = await this.mealRepo.findLog(memberId, messId, date)
    if (!log) return 0
    return log[SLOT_FIELD[slot]]
  }

  async getStatus(memberId: string, messId: string, date: string): Promise<MealActionResult> {
    await ensureDailyLogs(messId)
    const log = await this.mealRepo.findLog(memberId, messId, date)
    if (!log) {
      return { ok: true, message: `📋 You have no meals recorded for ${date}.` }
    }

    function fmtSlot(emoji: string, label: string, count: number): string {
      if (count === 0) return `${emoji} ${label}: ❌ OFF`
      if (count === 1) return `${emoji} ${label}: ✅ ON`
      return `${emoji} ${label}: ✅ ON (×${count})`
    }

    const lines = [
      `📅 *Today's Meals · ${date}*`,
      fmtSlot('🍳', 'Breakfast', log.breakfastCount),
      fmtSlot('🍱', 'Lunch', log.lunchCount),
      fmtSlot('🌙', 'Dinner', log.dinnerCount),
      `👥 Guests: breakfast ${slotGuests(log, 'breakfast')}, lunch ${slotGuests(log, 'lunch')}, dinner ${slotGuests(log, 'dinner')}`,
      log.frozen ? '\n🔒 _This day is frozen_' : '',
    ].filter(Boolean).join('\n')

    return { ok: true, message: lines }
  }
}
