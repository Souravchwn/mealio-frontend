/**
 * meal-preferences.ts — Server-only helpers for default-driven meal logic.
 *
 * A member's meals for a day come from their user_meal_preferences row for
 * that meal and day type, LIMITED BY the mess settings:
 *   - a meal turned off for the whole mess (meal_configs.enabled = false) is 0
 *   - counts are capped at the meal's max_count
 *   - which days are WEEKEND comes from the mess's weekend_days setting
 * Missing preference rows → meal enabled with count 1.
 *
 * Key types:
 *  MealDefaults — { breakfastCount, lunchCount, dinnerCount }
 *  DayType      — 'WEEKDAY' | 'WEEKEND'
 */

import { prisma } from './prisma'
import { getMessSettings, type MessSettings } from './mess-settings'
import { DEFAULT_WEEKEND_DAYS } from './constants'

export type DayType = 'WEEKDAY' | 'WEEKEND'

export type MealDefaults = {
  breakfastCount: number
  lunchCount:     number
  dinnerCount:    number
}

const ALL_ON: MealDefaults = { breakfastCount: 1, lunchCount: 1, dinnerCount: 1 }

const MEAL_KEYS = [
  ['BREAKFAST', 'breakfastCount'],
  ['LUNCH', 'lunchCount'],
  ['DINNER', 'dinnerCount'],
] as const

/**
 * WEEKDAY or WEEKEND for a date string (YYYY-MM-DD).
 * `weekendDays` are JS weekday numbers (0 = Sunday … 6 = Saturday).
 */
export function getDayType(date: string, weekendDays: readonly number[] = DEFAULT_WEEKEND_DAYS): DayType {
  const dow = new Date(`${date}T12:00:00.000Z`).getUTCDay()
  return weekendDays.includes(dow) ? 'WEEKEND' : 'WEEKDAY'
}

function mealKey(mealType: string): keyof MealDefaults | null {
  const entry = MEAL_KEYS.find(([t]) => t === mealType)
  return entry ? entry[1] : null
}

/** Apply mess-level rules (meal turned off for the mess, max count). */
function applyMessRules(d: MealDefaults, settings: MessSettings | null): MealDefaults {
  if (!settings) return d
  const out = { ...d }
  for (const [type, key] of MEAL_KEYS) {
    const meal = settings.meals[type]
    out[key] = meal.enabled ? Math.min(out[key], meal.maxCount) : 0
  }
  return out
}

/** Returns the default meal counts for a single member on a given date. */
export async function getMemberMealDefaults(
  memberId: string,
  messId: string,
  date: string,
): Promise<MealDefaults> {
  const map = await getBulkMealDefaults([memberId], messId, date)
  return map.get(memberId) ?? { ...ALL_ON }
}

/**
 * Returns default meal counts for multiple members on a given date.
 * Returns a Map keyed by memberId.
 */
export async function getBulkMealDefaults(
  memberIds: string[],
  messId: string,
  date: string,
): Promise<Map<string, MealDefaults>> {
  const map = new Map<string, MealDefaults>()
  if (memberIds.length === 0) return map

  const settings = await getMessSettings(messId)
  const dayType = getDayType(date, settings?.weekendDays)
  for (const id of memberIds) map.set(id, { ...ALL_ON })

  const prefs = await prisma.userMealPreference.findMany({
    where: { memberId: { in: memberIds }, messId, dayType },
    select: { memberId: true, mealType: true, enabled: true, defaultCount: true },
  })
  for (const p of prefs) {
    const curr = map.get(p.memberId)
    const key = mealKey(p.mealType)
    if (curr && key) curr[key] = p.enabled ? (p.defaultCount ?? 1) : 0
  }

  for (const [id, d] of map) map.set(id, applyMessRules(d, settings))
  return map
}
