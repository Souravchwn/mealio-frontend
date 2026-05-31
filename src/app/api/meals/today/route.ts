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

  // ── Try meal_configs for per-meal cutoffs; fall back to legacy cutoff ──────
  let cutoffHHMM = mess?.cutOffTime ? mess.cutOffTime.toISOString().slice(11, 16) : '21:00'
  let cutoffPassed = false

  try {
    const mealConfigs = await prisma.mealConfig.findMany({
      where: { messId: payload.messId, enabled: true },
      select: { cutoffTime: true },
      orderBy: { cutoffTime: 'asc' },
    })

    if (mealConfigs.length > 0) {
      const next = mealConfigs.find((c) => nowHHMM < c.cutoffTime.toISOString().slice(11, 16))
      if (next) {
        cutoffHHMM = next.cutoffTime.toISOString().slice(11, 16)
        cutoffPassed = false
      } else {
        cutoffHHMM = mealConfigs[mealConfigs.length - 1].cutoffTime.toISOString().slice(11, 16)
        cutoffPassed = true
      }
    } else {
      // No configs seeded yet — use legacy single cutoff
      cutoffPassed = nowHHMM >= cutoffHHMM
    }
  } catch {
    // meal_configs table not yet migrated — fall back to legacy cutoff
    cutoffPassed = nowHHMM >= cutoffHHMM
  }

  // Only enforce cutoff for today
  const todayReal = todayInTimezone(timezone)
  if (today !== todayReal) cutoffPassed = false

  // ── Get or create today's log ─────────────────────────────────────────────
  let log = await prisma.dailyLog.findFirst({
    where: { memberId, messId: payload.messId, logDate: logDateObj },
  })

  if (!log) {
    const defaults = await getMemberMealDefaults(memberId, payload.messId, today)
    log = await prisma.dailyLog.create({
      data: {
        memberId,
        messId: payload.messId,
        logDate: logDateObj,
        breakfastCount: defaults.breakfastCount,
        lunchCount: defaults.lunchCount,
        dinnerCount: defaults.dinnerCount,
        frozen: false,
        isOverride: false,
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
    guest_breakfast_count: log.guestBreakfastCount,
    guest_lunch_count: log.guestLunchCount,
    guest_dinner_count: log.guestDinnerCount,
    frozen: log.frozen,
    cut_off_time: cutoffHHMM,
    cut_off_passed: isFrozenOrPassed,
  })
}
