/**
 * MealConfigRepository — per-meal, per-mess configuration access.
 *
 * This repository drives the time-based meal targeting algorithm:
 *
 *   1. Fetch all enabled meal_configs for the mess
 *   2. Sort by cutoff_time ASC
 *   3. Find the FIRST meal where now (in mess timezone) < cutoff_time
 *   → That is the target meal for /meal on / /meal off
 *
 * This replaces the previous hardcoded lunch/dinner approach and allows
 * any number of meals with any cutoff times, fully configurable per mess.
 */

import { getMessSettings } from '@/lib/mess-settings'
import { MEAL_TYPES } from '@/lib/constants'

export interface MealConfigRow {
  mealType:   string   // BREAKFAST | LUNCH | DINNER
  enabled:    boolean
  cutoffTime: string   // HH:MM in the mess timezone
  maxCount:   number
}

/** Current HH:MM in the given timezone. */
function localHHMM(timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour:     '2-digit',
    minute:   '2-digit',
    timeZone: timezone,
    hour12:   false,
  }).format(new Date())
}

export class MealConfigRepository {
  /**
   * Returns all meal configs for a mess, sorted by cutoff_time ascending.
   * Falls back to a sensible default set if none are configured.
   */
  async getMessConfigs(messId: string): Promise<MealConfigRow[]> {
    // Served from Redis via mess settings (defaults applied there)
    const settings = await getMessSettings(messId)
    if (!settings) return []
    return MEAL_TYPES
      .map((mealType) => ({ mealType, ...settings.meals[mealType] }))
      .sort((a, b) => a.cutoffTime.localeCompare(b.cutoffTime))
  }

  /**
   * Determines the TARGET meal for the current time using the algorithm:
   *   sort enabled configs by cutoff ASC → find first where now < cutoff.
   *
   * Returns null if all cutoffs have passed (reject the command).
   */
  async getTargetMeal(messId: string, timezone: string): Promise<MealConfigRow | null> {
    const configs = await this.getMessConfigs(messId)
    const now = localHHMM(timezone)

    const enabled = configs.filter((c) => c.enabled).sort((a, b) =>
      a.cutoffTime.localeCompare(b.cutoffTime),
    )

    return enabled.find((c) => now < c.cutoffTime) ?? null
  }

  /**
   * Returns the config for a specific meal type, or null if not found/disabled.
   */
  async getMealConfig(messId: string, mealType: string): Promise<MealConfigRow | null> {
    const configs = await this.getMessConfigs(messId)
    return configs.find((c) => c.mealType === mealType) ?? null
  }

  /**
   * Checks whether a specific meal's cutoff has passed (for explicit slot commands).
   */
  async isCutoffPassed(messId: string, mealType: string, timezone: string): Promise<boolean> {
    const config = await this.getMealConfig(messId, mealType)
    if (!config) return true // unknown/disabled meal → block
    const now = localHHMM(timezone)
    return now >= config.cutoffTime
  }
}
