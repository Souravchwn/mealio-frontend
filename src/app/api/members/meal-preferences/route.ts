/**
 * /api/members/meal-preferences
 *
 * GET  — Returns the current user's meal preferences (3 meals × 2 day types = 6 rows).
 *        Missing rows default to enabled=true, defaultCount=1.
 *
 * PUT  — Change one default. Effective from the NEXT meal that has not
 *        reached its cutoff — never retroactive:
 *          1. every past day is recorded first with the OLD default (settleDailyLogs)
 *          2. today's log follows the new default only for that meal, only before
 *             its cutoff, and only if the member has not changed today by hand
 *        Body: { meal_type, day_type, enabled, default_count? }
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { getDayType } from '@/lib/meal-preferences'
import { getMessSettings, todayIn, nowHHMMIn } from '@/lib/mess-settings'
import { settleDailyLogs } from '@/lib/daily-logs'
import type { MealTypeUpper } from '@/lib/constants'

const MEAL_TYPES_UPPER: readonly MealTypeUpper[] = ['BREAKFAST', 'LUNCH', 'DINNER']
const DAY_TYPES = ['WEEKDAY', 'WEEKEND'] as const

const SLOT_COUNT_FIELD: Record<string, string> = {
  BREAKFAST: 'breakfastCount',
  LUNCH:     'lunchCount',
  DINNER:    'dinnerCount',
}

export async function GET(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  // Fetch prefs — gracefully handle missing default_count column (pre-migration)
  let prefs: Array<{ mealType: string; dayType: string; enabled: boolean; defaultCount: number }> = []
  try {
    const rows = await prisma.userMealPreference.findMany({
      where: { memberId: payload.sub, messId: payload.messId },
      select: { mealType: true, dayType: true, enabled: true, defaultCount: true },
    })
    prefs = rows.map((r) => ({ ...r, defaultCount: r.defaultCount ?? 1 }))
  } catch {
    // defaultCount column may not exist pre-migration — retry without it
    try {
      const rows = await prisma.userMealPreference.findMany({
        where: { memberId: payload.sub, messId: payload.messId },
        select: { mealType: true, dayType: true, enabled: true },
      })
      prefs = rows.map((r) => ({ ...r, defaultCount: 1 }))
    } catch {
      prefs = []
    }
  }

  const prefMap = new Map(prefs.map((p) => [`${p.mealType}_${p.dayType}`, p]))

  const preferences = MEAL_TYPES_UPPER.flatMap((meal) =>
    DAY_TYPES.map((day) => {
      const pref = prefMap.get(`${meal}_${day}`)
      return {
        meal_type: meal.toLowerCase(),
        day_type: day,
        enabled: pref?.enabled ?? true,
        default_count: pref?.defaultCount ?? 1,
      }
    })
  )

  return NextResponse.json({ preferences })
}

export async function PUT(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  let body: { meal_type?: unknown; day_type?: unknown; enabled?: unknown; default_count?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ detail: 'Invalid request body' }, { status: 400 })
  }
  const { meal_type, day_type, enabled, default_count } = body

  const mealTypeUpper = (typeof meal_type === 'string' ? meal_type.toUpperCase() : '') as MealTypeUpper
  if (!MEAL_TYPES_UPPER.includes(mealTypeUpper)) {
    return NextResponse.json({ detail: 'Invalid meal_type' }, { status: 400 })
  }
  if (!DAY_TYPES.includes(day_type as typeof DAY_TYPES[number])) {
    return NextResponse.json({ detail: 'Invalid day_type' }, { status: 400 })
  }
  const dayType = day_type as typeof DAY_TYPES[number]
  if (typeof enabled !== 'boolean') {
    return NextResponse.json({ detail: 'enabled must be a boolean' }, { status: 400 })
  }

  const settings = await getMessSettings(payload.messId)
  if (!settings) return NextResponse.json({ detail: 'Mess not found' }, { status: 404 })
  const meal = settings.meals[mealTypeUpper]

  let defaultCount = 1
  if (default_count !== undefined) {
    if (typeof default_count !== 'number' || !Number.isInteger(default_count) || default_count < 1 || default_count > meal.maxCount) {
      return NextResponse.json({ detail: `default_count must be a whole number between 1 and ${meal.maxCount}` }, { status: 400 })
    }
    defaultCount = default_count
  }

  try {
    // 1. Record every day so far with the OLD default — the change is never retroactive
    await settleDailyLogs(payload.messId)

    // 2. Save the preference
    const before = await prisma.userMealPreference.findUnique({
      where: { memberId_messId_mealType_dayType: { memberId: payload.sub, messId: payload.messId, mealType: mealTypeUpper, dayType } },
      select: { enabled: true, defaultCount: true },
    })
    await prisma.userMealPreference.upsert({
      where: { memberId_messId_mealType_dayType: { memberId: payload.sub, messId: payload.messId, mealType: mealTypeUpper, dayType } },
      create: { memberId: payload.sub, messId: payload.messId, mealType: mealTypeUpper, dayType, enabled, defaultCount },
      update: { enabled, defaultCount },
    })

    // 3. Today follows the new default only if this meal is still open and untouched
    const today = todayIn(settings.timezone)
    let appliedToday = false
    if (getDayType(today, settings.weekendDays) === dayType && nowHHMMIn(settings.timezone) < meal.cutoffTime) {
      const todayObj = new Date(`${today}T00:00:00.000Z`)
      const log = await prisma.dailyLog.findFirst({
        where: { memberId: payload.sub, messId: payload.messId, logDate: todayObj },
        select: { id: true, frozen: true, isOverride: true },
      })
      if (log && !log.frozen && !log.isOverride) {
        await prisma.dailyLog.update({
          where: { id: log.id },
          data: { [SLOT_COUNT_FIELD[mealTypeUpper]]: enabled && meal.enabled ? defaultCount : 0 },
        })
        appliedToday = true
      }
    }

    await prisma.auditLog.create({
      data: {
        messId: payload.messId,
        actorId: payload.sub,
        action: 'MEAL_PREFERENCE_UPDATE',
        targetTable: 'user_meal_preferences',
        oldValue: before ? { meal_type: mealTypeUpper, day_type: dayType, ...before } : undefined,
        newValue: { meal_type: mealTypeUpper, day_type: dayType, enabled, defaultCount, applied_today: appliedToday },
      },
    })

    return NextResponse.json({ ok: true, applied_today: appliedToday })
  } catch (err) {
    console.error('[PUT /api/members/meal-preferences] member=%s', payload.sub, err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
