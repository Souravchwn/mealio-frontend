import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { DEFAULT_TIMEZONE, VALID_MEAL_SLOTS } from '@/lib/constants'
import { createAudit } from '@/lib/audit'
import { getMemberMealDefaults } from '@/lib/meal-preferences'

type Slot = 'breakfast' | 'lunch' | 'dinner'

const SLOT_UPPER: Record<Slot, string> = {
  breakfast: 'BREAKFAST',
  lunch:     'LUNCH',
  dinner:    'DINNER',
}

const SLOT_COUNT_FIELD: Record<Slot, string> = {
  breakfast: 'breakfastCount',
  lunch:     'lunchCount',
  dinner:    'dinnerCount',
}

function localHHMM(tz: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', timeZone: tz, hour12: false,
  }).format(new Date())
}

function todayInTimezone(tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
}

export async function POST(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { member_id, date, slot, status, count } = body as {
    member_id?: string
    date?: string
    slot?: string
    status?: boolean
    count?: number
  }

  const slotLower = (slot as string)?.toLowerCase() as Slot
  if (!VALID_MEAL_SLOTS.includes(slotLower as typeof VALID_MEAL_SLOTS[number])) {
    return NextResponse.json({ detail: 'Invalid meal slot' }, { status: 400 })
  }

  const targetMemberId = (member_id as string) || payload.sub
  if (targetMemberId !== payload.sub && payload.role === 'MEMBER') {
    return NextResponse.json({ detail: "Cannot modify another member's meals" }, { status: 403 })
  }

  // ── Resolve timezone ──────────────────────────────────────────────────────
  const mess = await prisma.mess.findUnique({
    where: { id: payload.messId },
    select: {
      cutOffTime: true,
      telegramGroups: { where: { isActive: true }, select: { timezone: true }, take: 1 },
    },
  })
  const timezone = mess?.telegramGroups[0]?.timezone ?? DEFAULT_TIMEZONE
  const logDate = (date as string) || todayInTimezone(timezone)
  const logDateObj = new Date(`${logDate}T00:00:00.000Z`)

  // ── Cutoff check (only for today) ─────────────────────────────────────────
  const todayReal = todayInTimezone(timezone)
  if (logDate === todayReal) {
    const nowHHMM = localHHMM(timezone)
    let cutoffHHMM = mess?.cutOffTime ? mess.cutOffTime.toISOString().slice(11, 16) : '21:00'

    try {
      const cfg = await prisma.mealConfig.findFirst({
        where: { messId: payload.messId, mealType: SLOT_UPPER[slotLower], enabled: true },
        select: { cutoffTime: true },
      })
      if (cfg) cutoffHHMM = cfg.cutoffTime.toISOString().slice(11, 16)
    } catch {
      // meal_configs not migrated yet — use legacy single cutoff
    }

    if (nowHHMM >= cutoffHHMM) {
      return NextResponse.json(
        { detail: `Cut-off time (${cutoffHHMM}) has passed for this meal` },
        { status: 403 },
      )
    }
  }

  // ── Get or create the log ─────────────────────────────────────────────────
  let log = await prisma.dailyLog.findFirst({
    where: { memberId: targetMemberId, messId: payload.messId, logDate: logDateObj },
    select: { id: true, frozen: true, breakfastCount: true, lunchCount: true, dinnerCount: true },
  })

  if (!log) {
    const defaults = await getMemberMealDefaults(targetMemberId, payload.messId, logDate)
    const created = await prisma.dailyLog.create({
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
    log = created
  }

  if (log.frozen) return NextResponse.json({ detail: 'This day is frozen' }, { status: 403 })

  // ── Determine new count ───────────────────────────────────────────────────
  let newCount: number
  if (typeof count === 'number') {
    newCount = Math.max(0, count)
  } else if (typeof status === 'boolean') {
    if (status) {
      const defaults = await getMemberMealDefaults(targetMemberId, payload.messId, logDate)
      const prefKey = `${slotLower}Count` as 'breakfastCount' | 'lunchCount' | 'dinnerCount'
      newCount = defaults[prefKey] > 0 ? defaults[prefKey] : 1
    } else {
      newCount = 0
    }
  } else {
    const field = SLOT_COUNT_FIELD[slotLower] as 'breakfastCount' | 'lunchCount' | 'dinnerCount'
    const current = log[field]
    if (current > 0) {
      newCount = 0
    } else {
      const defaults = await getMemberMealDefaults(targetMemberId, payload.messId, logDate)
      const prefKey = `${slotLower}Count` as 'breakfastCount' | 'lunchCount' | 'dinnerCount'
      newCount = defaults[prefKey] > 0 ? defaults[prefKey] : 1
    }
  }

  const countField = SLOT_COUNT_FIELD[slotLower]
  await prisma.dailyLog.update({
    where: { id: log.id },
    data: { [countField]: newCount, isOverride: true, overrideType: 'USER', toggledAt: new Date() },
  })

  await createAudit({
    messId: payload.messId,
    actorId: payload.sub,
    action: 'TOGGLE_MEAL',
    targetTable: 'daily_logs',
    targetId: log.id,
    newValue: { slot: slotLower, count: newCount, date: logDate },
  })

  return NextResponse.json({ ok: true, count: newCount })
}
