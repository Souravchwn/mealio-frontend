/**
 * meal-preferences.ts — Server-only helpers for default-driven meal logic.
 *
 * Resolves a member's default meal counts from user_meal_preferences.
 * Missing rows → all meals enabled with count=1 (backward-compatible default).
 *
 * Defensive: handles pre-migration databases where default_count or the
 * user_meal_preferences table itself may not yet exist.
 *
 * Key types:
 *  MealDefaults — { breakfastCount, lunchCount, dinnerCount }
 *  DayType      — 'WEEKDAY' | 'WEEKEND'
 */

import { prisma } from './prisma'

export type DayType = 'WEEKDAY' | 'WEEKEND'

export type MealDefaults = {
  breakfastCount: number
  lunchCount:     number
  dinnerCount:    number
}

const ALL_ON: MealDefaults = { breakfastCount: 1, lunchCount: 1, dinnerCount: 1 }

/** Determine whether a date string (YYYY-MM-DD) falls on a weekday or weekend (UTC). */
export function getDayType(date: string): DayType {
  const dow = new Date(`${date}T12:00:00.000Z`).getUTCDay() // 0=Sun, 6=Sat
  return dow === 0 || dow === 6 ? 'WEEKEND' : 'WEEKDAY'
}

function mealKey(mealType: string): keyof MealDefaults | null {
  if (mealType === 'BREAKFAST') return 'breakfastCount'
  if (mealType === 'LUNCH')     return 'lunchCount'
  if (mealType === 'DINNER')    return 'dinnerCount'
  return null
}

/**
 * Returns the default meal counts for a single member on a given date.
 * Gracefully handles pre-migration databases.
 */
export async function getMemberMealDefaults(
  memberId: string,
  messId: string,
  date: string,
): Promise<MealDefaults> {
  const dayType = getDayType(date)

  try {
    const prefs = await prisma.userMealPreference.findMany({
      where: { memberId, messId, dayType },
      select: { mealType: true, enabled: true, defaultCount: true },
    })
    const result: MealDefaults = { ...ALL_ON }
    for (const p of prefs) {
      const key = mealKey(p.mealType)
      if (key) result[key] = p.enabled ? (p.defaultCount ?? 1) : 0
    }
    return result
  } catch {
    // defaultCount column missing pre-migration — retry without it
    try {
      const prefs = await prisma.userMealPreference.findMany({
        where: { memberId, messId, dayType },
        select: { mealType: true, enabled: true },
      })
      const result: MealDefaults = { ...ALL_ON }
      for (const p of prefs) {
        const key = mealKey(p.mealType)
        if (key) result[key] = p.enabled ? 1 : 0
      }
      return result
    } catch {
      return { ...ALL_ON }
    }
  }
}

/**
 * Returns default meal counts for multiple members on a given date.
 * Returns a Map keyed by memberId; all members default to all-1 counts.
 */
export async function getBulkMealDefaults(
  memberIds: string[],
  messId: string,
  date: string,
): Promise<Map<string, MealDefaults>> {
  if (memberIds.length === 0) return new Map()

  const dayType = getDayType(date)
  const map = new Map<string, MealDefaults>()
  for (const id of memberIds) map.set(id, { ...ALL_ON })

  try {
    const prefs = await prisma.userMealPreference.findMany({
      where: { memberId: { in: memberIds }, messId, dayType },
      select: { memberId: true, mealType: true, enabled: true, defaultCount: true },
    })
    for (const p of prefs) {
      const curr = map.get(p.memberId)
      const key = mealKey(p.mealType)
      if (curr && key) curr[key] = p.enabled ? (p.defaultCount ?? 1) : 0
    }
    return map
  } catch {
    // Fallback without defaultCount
    try {
      const prefs = await prisma.userMealPreference.findMany({
        where: { memberId: { in: memberIds }, messId, dayType },
        select: { memberId: true, mealType: true, enabled: true },
      })
      for (const p of prefs) {
        const curr = map.get(p.memberId)
        const key = mealKey(p.mealType)
        if (curr && key) curr[key] = p.enabled ? 1 : 0
      }
    } catch {
      // user_meal_preferences missing entirely — all defaults stay at 1
    }
    return map
  }
}
