/**
 * member-preferences.ts — Server-only. Read and change one member's default meals
 * (3 meals × 2 day types). Shared by:
 *   - /api/members/meal-preferences       (a member changing their own)
 *   - /api/members/[id]/meal-preferences  (an admin or manager setting someone's pattern)
 *
 * A meal without a preference row follows the mess default (settings.defaultMeals).
 * A change is never retroactive:
 *   1. every past day is recorded first with the OLD default (settleDailyLogs)
 *   2. today's log follows the new default only for that meal, only before its cutoff,
 *      and only if nobody changed today by hand
 */

import { prisma } from './prisma'
import { getDayType } from './meal-preferences'
import { todayIn, nowHHMMIn, type MessSettings } from './mess-settings'
import { settleDailyLogs } from './daily-logs'
import type { MealTypeUpper } from './constants'

export const MEAL_TYPES_UPPER: readonly MealTypeUpper[] = ['BREAKFAST', 'LUNCH', 'DINNER']
export const DAY_TYPES = ['WEEKDAY', 'WEEKEND'] as const
type DayType = (typeof DAY_TYPES)[number]

const SLOT_COUNT_FIELD: Record<MealTypeUpper, string> = {
  BREAKFAST: 'breakfastCount',
  LUNCH: 'lunchCount',
  DINNER: 'dinnerCount',
}

export interface PreferenceRow {
  meal_type: string
  day_type: DayType
  enabled: boolean
  default_count: number
  /** false = no own row, following the mess default */
  custom: boolean
}

/** The 6 defaults of one member, with the mess default filling the gaps. */
export async function readMemberPreferences(memberId: string, messId: string, settings: MessSettings): Promise<PreferenceRow[]> {
  const rows = await prisma.userMealPreference.findMany({
    where: { memberId, messId },
    select: { mealType: true, dayType: true, enabled: true, defaultCount: true },
  })
  const byKey = new Map(rows.map((r) => [`${r.mealType}_${r.dayType}`, r]))
  return MEAL_TYPES_UPPER.flatMap((meal) =>
    DAY_TYPES.map((day) => {
      const own = byKey.get(`${meal}_${day}`)
      return {
        meal_type: meal.toLowerCase(),
        day_type: day,
        enabled: own ? own.enabled : settings.defaultMeals[day][meal],
        default_count: own?.defaultCount ?? 1,
        custom: !!own,
      }
    }),
  )
}

export type PreferenceUpdate =
  | { ok: true; appliedToday: boolean }
  | { ok: false; status: number; detail: string }

/** Validate and apply one change: body { meal_type, day_type, enabled, default_count? }. */
export async function updateMemberPreference(opts: {
  memberId: string
  messId: string
  actorId: string
  settings: MessSettings
  body: { meal_type?: unknown; day_type?: unknown; enabled?: unknown; default_count?: unknown }
}): Promise<PreferenceUpdate> {
  const { memberId, messId, actorId, settings, body } = opts
  const mealType = (typeof body.meal_type === 'string' ? body.meal_type.toUpperCase() : '') as MealTypeUpper
  if (!MEAL_TYPES_UPPER.includes(mealType)) return { ok: false, status: 400, detail: 'Invalid meal_type' }
  if (!DAY_TYPES.includes(body.day_type as DayType)) return { ok: false, status: 400, detail: 'Invalid day_type' }
  const dayType = body.day_type as DayType
  if (typeof body.enabled !== 'boolean') return { ok: false, status: 400, detail: 'enabled must be a boolean' }
  const enabled = body.enabled

  const meal = settings.meals[mealType]
  let defaultCount = 1
  if (body.default_count !== undefined) {
    const c = body.default_count
    if (typeof c !== 'number' || !Number.isInteger(c) || c < 1 || c > meal.maxCount) {
      return { ok: false, status: 400, detail: `default_count must be a whole number between 1 and ${meal.maxCount}` }
    }
    defaultCount = c
  }

  // 1. Record every day so far with the OLD default
  await settleDailyLogs(messId)

  // 2. Save the preference
  const where = { memberId_messId_mealType_dayType: { memberId, messId, mealType, dayType } }
  const before = await prisma.userMealPreference.findUnique({ where, select: { enabled: true, defaultCount: true } })
  await prisma.userMealPreference.upsert({
    where,
    create: { memberId, messId, mealType, dayType, enabled, defaultCount },
    update: { enabled, defaultCount },
  })

  // 3. Today follows the new default only if this meal is still open and untouched
  const today = todayIn(settings.timezone)
  let appliedToday = false
  if (getDayType(today, settings.weekendDays) === dayType && nowHHMMIn(settings.timezone) < meal.cutoffTime) {
    const log = await prisma.dailyLog.findFirst({
      where: { memberId, messId, logDate: new Date(`${today}T00:00:00.000Z`) },
      select: { id: true, frozen: true, isOverride: true },
    })
    if (log && !log.frozen && !log.isOverride) {
      await prisma.dailyLog.update({
        where: { id: log.id },
        data: { [SLOT_COUNT_FIELD[mealType]]: enabled && meal.enabled ? defaultCount : 0 },
      })
      appliedToday = true
    }
  }

  await prisma.auditLog.create({
    data: {
      messId,
      actorId,
      action: 'MEAL_PREFERENCE_UPDATE',
      targetTable: 'user_meal_preferences',
      targetId: memberId,
      oldValue: before ? { meal_type: mealType, day_type: dayType, ...before } : undefined,
      newValue: { meal_type: mealType, day_type: dayType, enabled, defaultCount, applied_today: appliedToday },
    },
  })

  return { ok: true, appliedToday }
}

/** Drop a member's own defaults so they follow the mess default again (from the next day). */
export async function resetMemberPreferences(memberId: string, messId: string, actorId: string): Promise<void> {
  await settleDailyLogs(messId)
  await prisma.userMealPreference.deleteMany({ where: { memberId, messId } })
  await prisma.auditLog.create({
    data: {
      messId,
      actorId,
      action: 'MEAL_PREFERENCE_UPDATE',
      targetTable: 'user_meal_preferences',
      targetId: memberId,
      newValue: { reset_to_mess_default: true },
    },
  })
}
