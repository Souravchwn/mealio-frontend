import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { DEFAULT_TIMEZONE, VALID_MEAL_SLOTS } from '@/lib/constants'
import { getMemberMealDefaults } from '@/lib/meal-preferences'

type Slot = 'breakfast' | 'lunch' | 'dinner'

const SLOT_UPPER: Record<Slot, string> = {
  breakfast: 'BREAKFAST',
  lunch:     'LUNCH',
  dinner:    'DINNER',
}

const GUEST_SLOT_FIELD: Record<Slot, 'guestBreakfastCount' | 'guestLunchCount' | 'guestDinnerCount'> = {
  breakfast: 'guestBreakfastCount',
  lunch:     'guestLunchCount',
  dinner:    'guestDinnerCount',
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

  const { member_id, date, slot, guest_count } = await req.json()

  const slotLower = (slot as string)?.toLowerCase() as Slot
  if (!VALID_MEAL_SLOTS.includes(slotLower as typeof VALID_MEAL_SLOTS[number])) {
    return NextResponse.json({ detail: 'Invalid meal slot' }, { status: 400 })
  }

  if (typeof guest_count !== 'number' || guest_count < 0) {
    return NextResponse.json({ detail: 'Guest count cannot be negative' }, { status: 400 })
  }

  const targetMemberId = (member_id as string) || payload.sub
  if (targetMemberId !== payload.sub && payload.role === 'MEMBER') {
    return NextResponse.json({ detail: "Cannot modify another member's log" }, { status: 403 })
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

  // ── Per-slot cutoff check (only for today) ────────────────────────────────
  const todayReal = todayInTimezone(timezone)
  if (logDate === todayReal) {
    const nowHHMM = localHHMM(timezone)
    let cutoffHHMM = mess?.cutOffTime ? mess.cutOffTime.toISOString().slice(11, 16) : '21:00'

    try {
      const cfg = await prisma.mealConfig.findFirst({
        where: { messId: payload.messId, mealType: SLOT_UPPER[slotLower] },
        select: { cutoffTime: true, enabled: true },
      })
      if (cfg && !cfg.enabled) {
        return NextResponse.json(
          { detail: `${SLOT_UPPER[slotLower]} is disabled for this mess` },
          { status: 403 },
        )
      }
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

  const guestField = GUEST_SLOT_FIELD[slotLower]

  const log = await prisma.dailyLog.findFirst({
    where: { memberId: targetMemberId, messId: payload.messId, logDate: logDateObj },
    select: { id: true, frozen: true },
  })

  if (!log) {
    const defaults = await getMemberMealDefaults(targetMemberId, payload.messId, logDate)
    await prisma.dailyLog.create({
      data: {
        memberId: targetMemberId,
        messId: payload.messId,
        logDate: logDateObj,
        breakfastCount: defaults.breakfastCount,
        lunchCount: defaults.lunchCount,
        dinnerCount: defaults.dinnerCount,
        [guestField]: guest_count,
        frozen: false,
      },
    })
  } else {
    if (log.frozen) return NextResponse.json({ detail: 'This day is frozen' }, { status: 403 })
    await prisma.dailyLog.update({
      where: { id: log.id },
      data: { [guestField]: guest_count, toggledAt: new Date() },
    })
  }

  return NextResponse.json({ ok: true, slot: slotLower, guest_count })
}
