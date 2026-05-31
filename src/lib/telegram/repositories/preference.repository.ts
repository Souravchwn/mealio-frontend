/**
 * PreferenceRepository — read user meal preferences for the Telegram bot layer.
 * Thin wrapper around the shared meal-preferences helper so services stay
 * decoupled from direct Prisma calls.
 */

import { getDayType, getMemberMealDefaults, getBulkMealDefaults } from '@/lib/meal-preferences'
import type { MealDefaults } from '@/lib/meal-preferences'

export type { MealDefaults }

export class PreferenceRepository {
  /**
   * Returns the default meal slots for a single member on a given date.
   * Missing preference rows default to all-enabled (backward compatible).
   */
  async getMemberPreferences(memberId: string, messId: string, date: string): Promise<MealDefaults> {
    return getMemberMealDefaults(memberId, messId, date)
  }

  /**
   * Returns preferences for multiple members on a given date.
   * Map is keyed by memberId; all members default to all-enabled.
   */
  async getBulkPreferences(memberIds: string[], messId: string, date: string): Promise<Map<string, MealDefaults>> {
    return getBulkMealDefaults(memberIds, messId, date)
  }

  /** Returns the day type (WEEKDAY | WEEKEND) for a date string. */
  getDayType(date: string) {
    return getDayType(date)
  }
}
