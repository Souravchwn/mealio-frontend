import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { isActiveMemberOfMess, isPrivileged } from '@/lib/meal-access'
import { getMemberDayMeals } from '@/lib/today'

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

  try {
    const day = await getMemberDayMeals(payload.messId, memberId, logDate)
    if (!day) return NextResponse.json({ detail: 'Mess not found' }, { status: 404 })

    const slotCutoffs = {
      breakfast: { cutoff_time: day.slotCutoffs.breakfast.cutoffTime, cutoff_passed: day.slotCutoffs.breakfast.cutoffPassed },
      lunch: { cutoff_time: day.slotCutoffs.lunch.cutoffTime, cutoff_passed: day.slotCutoffs.lunch.cutoffPassed },
      dinner: { cutoff_time: day.slotCutoffs.dinner.cutoffTime, cutoff_passed: day.slotCutoffs.dinner.cutoffPassed },
    }
    return NextResponse.json({
      id: day.logId,
      member_id: day.memberId,
      date: day.date,
      breakfast_count: day.breakfastCount,
      lunch_count: day.lunchCount,
      dinner_count: day.dinnerCount,
      breakfast: day.breakfastCount > 0,
      lunch: day.lunchCount > 0,
      dinner: day.dinnerCount > 0,
      guest_count: day.guestCount,
      frozen: day.frozen,
      // false = auto-generated from preferences; true = manually changed (absent when there is no log)
      ...(day.logId ? { is_override: day.isOverride } : {}),
      // Backward-compat (used by overview, etc.)
      cut_off_time: day.cutOffTime,
      cut_off_passed: day.cutOffPassed,
      // Per-slot cutoff state
      slot_cutoffs: slotCutoffs,
      guest_meal_policy: day.guestMealPolicy,
      // WEEKDAY / WEEKEND per the mess's weekend setting
      day_type: day.dayType,
    })
  } catch (err) {
    console.error('[GET /api/meals/today] member=%s date=%s', memberId, logDate, err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
