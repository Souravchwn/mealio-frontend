import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { VALID_MEAL_SLOTS, type MealTypeUpper } from '@/lib/constants'
import { createAudit } from '@/lib/audit'
import { getMemberMealDefaults } from '@/lib/meal-preferences'
import { getMessSettings, nowHHMMIn } from '@/lib/mess-settings'
import { checkMealWriteAccess } from '@/lib/meal-access'

type Slot = 'breakfast' | 'lunch' | 'dinner'

const SLOT_UPPER: Record<Slot, MealTypeUpper> = {
  breakfast: 'BREAKFAST',
  lunch:     'LUNCH',
  dinner:    'DINNER',
}

const SLOT_COUNT_FIELD = {
  breakfast: 'breakfastCount',
  lunch:     'lunchCount',
  dinner:    'dinnerCount',
} as const

export async function POST(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  let body: { member_id?: unknown; date?: unknown; slot?: unknown; status?: unknown; count?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ detail: 'Invalid request body' }, { status: 400 })
  }
  const { member_id, date, slot, status, count } = body

  const slotLower = (typeof slot === 'string' ? slot.toLowerCase() : '') as Slot
  if (!VALID_MEAL_SLOTS.includes(slotLower)) {
    return NextResponse.json({ detail: 'Invalid meal slot' }, { status: 400 })
  }

  const settings = await getMessSettings(payload.messId)
  if (!settings) return NextResponse.json({ detail: 'Mess not found' }, { status: 404 })
  const slotSettings = settings.meals[SLOT_UPPER[slotLower]]

  const access = await checkMealWriteAccess(payload, settings, member_id, date)
  if (!access.ok) return NextResponse.json({ detail: access.detail }, { status: access.status })
  const { targetMemberId, date: logDate, isToday } = access

  if (count !== undefined && (typeof count !== 'number' || !Number.isInteger(count) || count < 0 || count > slotSettings.maxCount)) {
    return NextResponse.json({ detail: `Count must be a whole number between 0 and ${slotSettings.maxCount}` }, { status: 400 })
  }

  // ── Cutoff check (only for today) ─────────────────────────────────────────
  if (isToday && nowHHMMIn(settings.timezone) >= slotSettings.cutoffTime) {
    return NextResponse.json(
      { detail: `Cut-off time (${slotSettings.cutoffTime}) has passed for this meal` },
      { status: 403 },
    )
  }

  const logDateObj = new Date(`${logDate}T00:00:00.000Z`)

  try {
    // ── Get or create the log ───────────────────────────────────────────────
    let log = await prisma.dailyLog.findFirst({
      where: { memberId: targetMemberId, messId: payload.messId, logDate: logDateObj },
      select: { id: true, frozen: true, breakfastCount: true, lunchCount: true, dinnerCount: true },
    })

    if (!log) {
      const defaults = await getMemberMealDefaults(targetMemberId, payload.messId, logDate)
      log = await prisma.dailyLog.create({
        data: {
          memberId: targetMemberId,
          messId: payload.messId,
          logDate: logDateObj,
          breakfastCount: defaults.breakfastCount,
          lunchCount: defaults.lunchCount,
          dinnerCount: defaults.dinnerCount,
          guestCount: 0,
          frozen: false,
          isOverride: false,
        },
        select: { id: true, frozen: true, breakfastCount: true, lunchCount: true, dinnerCount: true },
      })
    }

    if (log.frozen) return NextResponse.json({ detail: 'This day is frozen' }, { status: 403 })

    // ── Determine new count ─────────────────────────────────────────────────
    const field = SLOT_COUNT_FIELD[slotLower]
    const turnOn = typeof count === 'number'
      ? count > 0
      : typeof status === 'boolean' ? status : log[field] === 0

    let newCount: number
    if (typeof count === 'number') {
      newCount = count
    } else if (turnOn) {
      const defaults = await getMemberMealDefaults(targetMemberId, payload.messId, logDate)
      newCount = Math.min(defaults[field] > 0 ? defaults[field] : 1, slotSettings.maxCount)
    } else {
      newCount = 0
    }

    if (newCount > 0 && !slotSettings.enabled) {
      return NextResponse.json({ detail: 'This meal is turned off for the mess' }, { status: 400 })
    }

    await prisma.dailyLog.update({
      where: { id: log.id },
      data: { [field]: newCount, isOverride: true, overrideType: 'USER', toggledAt: new Date() },
    })

    await createAudit({
      messId: payload.messId,
      actorId: payload.sub,
      action: 'TOGGLE_MEAL',
      targetTable: 'daily_logs',
      targetId: log.id,
      oldValue: { slot: slotLower, count: log[field] },
      newValue: { slot: slotLower, count: newCount, date: logDate, member_id: targetMemberId },
    })

    return NextResponse.json({ ok: true, count: newCount })
  } catch (err) {
    console.error('[POST /api/meals/toggle] member=%s date=%s', targetMemberId, logDate, err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
