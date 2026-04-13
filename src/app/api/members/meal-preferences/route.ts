/**
 * /api/members/meal-preferences
 *
 * GET  — Returns the current user's meal preferences (3 meals × 2 day types = 6 rows).
 *        Missing rows default to enabled=true, defaultCount=1.
 *
 * PUT  — Upsert one preference AND immediately sync today's DailyLog.
 *        Body: { meal_type, day_type, enabled, default_count? }
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { getDayType } from '@/lib/meal-preferences'
import { DEFAULT_TIMEZONE } from '@/lib/constants'

function todayInTimezone(tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
}

const MEAL_TYPES_UPPER = ['BREAKFAST', 'LUNCH', 'DINNER'] as const
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

  const body = await req.json()
  const { meal_type, day_type, enabled, default_count } = body as {
    meal_type?: string
    day_type?: string
    enabled?: boolean
    default_count?: number
  }

  const mealTypeUpper = (meal_type as string)?.toUpperCase()

  if (!MEAL_TYPES_UPPER.includes(mealTypeUpper as typeof MEAL_TYPES_UPPER[number])) {
    return NextResponse.json({ detail: 'Invalid meal_type' }, { status: 400 })
  }
  if (!DAY_TYPES.includes(day_type as typeof DAY_TYPES[number])) {
    return NextResponse.json({ detail: 'Invalid day_type' }, { status: 400 })
  }
  if (typeof enabled !== 'boolean') {
    return NextResponse.json({ detail: 'enabled must be a boolean' }, { status: 400 })
  }
  const defaultCount = typeof default_count === 'number' ? Math.max(0, default_count) : 1

  // 1. Save the preference (try with defaultCount, fall back without if column missing)
  try {
    await prisma.userMealPreference.upsert({
      where: {
        memberId_messId_mealType_dayType: {
          memberId: payload.sub,
          messId: payload.messId,
          mealType: mealTypeUpper,
          dayType: day_type!,
        },
      },
      create: {
        memberId: payload.sub,
        messId: payload.messId,
        mealType: mealTypeUpper,
        dayType: day_type!,
        enabled,
        defaultCount,
      },
      update: { enabled, defaultCount },
    })
  } catch {
    // defaultCount column missing pre-migration — upsert without it
    await prisma.userMealPreference.upsert({
      where: {
        memberId_messId_mealType_dayType: {
          memberId: payload.sub,
          messId: payload.messId,
          mealType: mealTypeUpper,
          dayType: day_type!,
        },
      },
      create: {
        memberId: payload.sub,
        messId: payload.messId,
        mealType: mealTypeUpper,
        dayType: day_type!,
        enabled,
      },
      update: { enabled },
    })
  }

  // 2. Sync today's DailyLog if the changed day_type matches today
  try {
    const mess = await prisma.mess.findUnique({
      where: { id: payload.messId },
      select: {
        telegramGroups: { where: { isActive: true }, select: { timezone: true }, take: 1 },
      },
    })
    const timezone = mess?.telegramGroups[0]?.timezone ?? DEFAULT_TIMEZONE
    const todayStr = todayInTimezone(timezone)
    const todayDayType = getDayType(todayStr)

    if (todayDayType === day_type) {
      const todayObj = new Date(`${todayStr}T00:00:00.000Z`)
      const existingLog = await prisma.dailyLog.findFirst({
        where: { memberId: payload.sub, messId: payload.messId, logDate: todayObj },
        select: { id: true, frozen: true },
      })

      if (existingLog && !existingLog.frozen) {
        const countField = SLOT_COUNT_FIELD[mealTypeUpper]
        const newCount = enabled ? defaultCount : 0
        await prisma.dailyLog.update({
          where: { id: existingLog.id },
          data: { [countField]: newCount },
        })
      }
    }
  } catch {
    // Log sync is best-effort — don't fail the preference save
  }

  return NextResponse.json({ ok: true })
}
