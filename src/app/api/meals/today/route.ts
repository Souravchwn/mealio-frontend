import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { getMemberMealDefaults } from '@/lib/meal-preferences'
import { getMessSettings, todayIn, nowHHMMIn } from '@/lib/mess-settings'
import { isActiveMemberOfMess, isPrivileged } from '@/lib/meal-access'
import { ensureDailyLogs } from '@/lib/daily-logs'
import { getDayType } from '@/lib/meal-preferences'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const memberId = searchParams.get('member_id') || payload.sub
  const logDate = searchParams.get('log_date')

  if (memberId !== payload.sub) {
    if (!isPrivileged(payload.role)) {
      return NextResponse.json({ detail: "You can only view your own meals" }, { status: 403 })
    }
    if (!(await isActiveMemberOfMess(memberId, payload.messId))) {
      return NextResponse.json({ detail: 'Member not found in this mess' }, { status: 404 })
    }
  }
  if (logDate && !DATE_RE.test(logDate)) {
    return NextResponse.json({ detail: 'log_date must be YYYY-MM-DD' }, { status: 400 })
  }

  // ── Mess settings (timezone + per-meal cutoffs) — served from Redis ─────────
  const settings = await getMessSettings(payload.messId)
  if (!settings) return NextResponse.json({ detail: 'Mess not found' }, { status: 404 })

  const todayReal = todayIn(settings.timezone)
  const today = logDate || todayReal
  const logDateObj = new Date(`${today}T00:00:00.000Z`)
  const nowHHMM = nowHHMMIn(settings.timezone)
  const isToday = today === todayReal

  const slotCutoffTimes = {
    BREAKFAST: settings.meals.BREAKFAST.cutoffTime,
    LUNCH:     settings.meals.LUNCH.cutoffTime,
    DINNER:    settings.meals.DINNER.cutoffTime,
  }

  // Only enforce cutoff for today; past dates are never blocked
  const slotCutoffs = {
    breakfast: { cutoff_time: slotCutoffTimes.BREAKFAST, cutoff_passed: isToday && nowHHMM >= slotCutoffTimes.BREAKFAST },
    lunch:     { cutoff_time: slotCutoffTimes.LUNCH,     cutoff_passed: isToday && nowHHMM >= slotCutoffTimes.LUNCH },
    dinner:    { cutoff_time: slotCutoffTimes.DINNER,    cutoff_passed: isToday && nowHHMM >= slotCutoffTimes.DINNER },
  }

  // Backward-compat single cutoff: next upcoming slot, or last slot if all passed
  const slots = ['BREAKFAST', 'LUNCH', 'DINNER'] as const
  const nextSlot = slots.find((s) => !slotCutoffs[s.toLowerCase() as keyof typeof slotCutoffs].cutoff_passed)
  const cutoffHHMM = nextSlot ? slotCutoffTimes[nextSlot] : slotCutoffTimes.DINNER
  const cutoffPassed = !nextSlot && isToday

  // Make sure today's logs exist for the whole mess (replaces the daily cron)
  if (isToday) await ensureDailyLogs(payload.messId)

  try {
    let log = await prisma.dailyLog.findFirst({
      where: { memberId, messId: payload.messId, logDate: logDateObj },
    })

    if (!log) {
      if (!isToday) {
        // Historical or future date with no log → no meals that day.
        // Do NOT create phantom entries — this prevents inflated meal counts.
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
          cut_off_passed:   true,
          slot_cutoffs:     slotCutoffs,
          guest_meal_policy: settings.guestMealPolicy,
          day_type: getDayType(today, settings.weekendDays),
        })
      }
      // Today with no log (e.g. a guest member) — create from preferences
      const defaults = await getMemberMealDefaults(memberId, payload.messId, today)
      log = await prisma.dailyLog.upsert({
        where: { messId_memberId_logDate: { messId: payload.messId, memberId, logDate: logDateObj } },
        create: {
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
        update: {},
      })
    }

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
      // false = auto-generated from preferences; true = manually changed
      is_override: log.isOverride,
      // Backward-compat (used by overview, etc.)
      cut_off_time: cutoffHHMM,
      cut_off_passed: log.frozen || cutoffPassed,
      // Per-slot cutoff state
      slot_cutoffs: slotCutoffs,
      guest_meal_policy: settings.guestMealPolicy,
      // WEEKDAY / WEEKEND per the mess's weekend setting
      day_type: getDayType(today, settings.weekendDays),
    })
  } catch (err) {
    console.error('[GET /api/meals/today] member=%s date=%s', memberId, today, err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
