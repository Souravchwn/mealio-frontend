import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { DEFAULT_TIMEZONE } from '@/lib/constants'
import { getMemberMealDefaults } from '@/lib/meal-preferences'

function todayInTimezone(tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
}

function localHHMM(tz: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', timeZone: tz, hour12: false,
  }).format(new Date())
}

export async function GET(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const memberId = searchParams.get('member_id') || payload.sub
  const logDate = searchParams.get('log_date')

  // ── Resolve mess metadata (timezone + legacy cutoff) ──────────────────────
  const mess = await prisma.mess.findUnique({
    where: { id: payload.messId },
    select: {
      cutOffTime: true,
      telegramGroups: { where: { isActive: true }, select: { timezone: true }, take: 1 },
    },
  })

  const timezone = mess?.telegramGroups[0]?.timezone ?? DEFAULT_TIMEZONE
  const today = logDate || todayInTimezone(timezone)
  const logDateObj = new Date(`${today}T00:00:00.000Z`)
  const nowHHMM = localHHMM(timezone)

  // ── Per-slot cutoffs from meal_configs (fall back to legacy) ────────────────
  const legacyCutoff = mess?.cutOffTime ? mess.cutOffTime.toISOString().slice(11, 16) : '21:00'

  const DEFAULT_SLOT_CUTOFFS: Record<string, string> = {
    BREAKFAST: '08:30',
    LUNCH:     '13:00',
    DINNER:    legacyCutoff,
  }

  let slotCutoffTimes: Record<string, string> = { ...DEFAULT_SLOT_CUTOFFS }

  try {
    const mealConfigs = await prisma.mealConfig.findMany({
      where: { messId: payload.messId },
      select: { mealType: true, cutoffTime: true },
    })
    for (const c of mealConfigs) {
      slotCutoffTimes[c.mealType] = c.cutoffTime.toISOString().slice(11, 16)
    }
  } catch {
    // meal_configs not yet migrated — use defaults
  }

  // Only enforce cutoff for today; past dates are never blocked
  const todayReal = todayInTimezone(timezone)
  const isToday = today === todayReal

  const slotCutoffs = {
    breakfast: { cutoff_time: slotCutoffTimes['BREAKFAST'], cutoff_passed: isToday && nowHHMM >= slotCutoffTimes['BREAKFAST'] },
    lunch:     { cutoff_time: slotCutoffTimes['LUNCH'],     cutoff_passed: isToday && nowHHMM >= slotCutoffTimes['LUNCH'] },
    dinner:    { cutoff_time: slotCutoffTimes['DINNER'],    cutoff_passed: isToday && nowHHMM >= slotCutoffTimes['DINNER'] },
  }

  // Backward-compat single cutoff: next upcoming slot, or last slot if all passed
  const slots = ['BREAKFAST', 'LUNCH', 'DINNER'] as const
  const nextSlot = slots.find((s) => !slotCutoffs[s.toLowerCase() as keyof typeof slotCutoffs].cutoff_passed)
  const cutoffHHMM = nextSlot
    ? slotCutoffTimes[nextSlot]
    : slotCutoffTimes['DINNER']
  const cutoffPassed = !nextSlot && isToday

  // ── Get or create log ────────────────────────────────────────────────────
  let log = await prisma.dailyLog.findFirst({
    where: { memberId, messId: payload.messId, logDate: logDateObj },
  })

  if (!log) {
    if (!isToday) {
      // Historical or future date with no log → no meals that day.
      // Do NOT create phantom entries — this prevents inflated meal counts
      // when pages request past dates (e.g. my-summary 7-day strip) for new members.
      const isFrozenOrPassedNoLog = true // past/future dates: cutoff always "passed"
      return NextResponse.json({
        id:               null,
        member_id:        memberId,
        date:             today,
        breakfast_count:  0,
        lunch_count:      0,
        dinner_count:     0,
        breakfast:        false,
        lunch:            false,
        dinner:           false,
        guest_count:      0,
        frozen:           false,
        cut_off_time:     cutoffHHMM,
        cut_off_passed:   isFrozenOrPassedNoLog,
        slot_cutoffs:     slotCutoffs,
      })
    }
    // Today with no log — auto-create from member's meal preferences
    // (cron generate-daily-meals runs at 00:05 but member may have just registered)
    const defaults = await getMemberMealDefaults(memberId, payload.messId, today)
    log = await prisma.dailyLog.create({
      data: {
        memberId,
        messId:         payload.messId,
        logDate:        logDateObj,
        breakfastCount: defaults.breakfastCount,
        lunchCount:     defaults.lunchCount,
        dinnerCount:    defaults.dinnerCount,
        guestCount:     0,
        frozen:         false,
        isOverride:     false,
      },
    })
  }

  const isFrozenOrPassed = log.frozen || cutoffPassed

  return NextResponse.json({
    id: log.id,
    member_id: log.memberId,
    date: log.logDate.toISOString().slice(0, 10),
    breakfast_count: log.breakfastCount,
    lunch_count: log.lunchCount,
    dinner_count: log.dinnerCount,
    breakfast: log.breakfastCount > 0,
    lunch: log.lunchCount > 0,
    dinner: log.dinnerCount > 0,
    guest_count: log.guestCount,
    frozen: log.frozen,
    // false = auto-generated by cron from preferences; true = manually changed
    is_override: log.isOverride,
    // Backward-compat (used by overview, etc.)
    cut_off_time: cutoffHHMM,
    cut_off_passed: isFrozenOrPassed,
    // Per-slot cutoff state
    slot_cutoffs: slotCutoffs,
  })
}
