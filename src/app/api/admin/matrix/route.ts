import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { calculatePeriodSummary, guestMeals } from '@/lib/financial'
import { guestsBySlot } from '@/lib/guests'
import { resolvePeriod } from '@/lib/period'
import { getMessSettings } from '@/lib/mess-settings'

export async function GET(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  if (payload.role !== 'ADMIN' && payload.role !== 'MANAGER') {
    return NextResponse.json({ detail: 'Admin or Manager access required' }, { status: 403 })
  }

  // Always the caller's own mess — never a mess id from the request
  const messId = payload.messId
  const { searchParams } = new URL(req.url)
  const yearMonth = searchParams.get('year_month') || null

  try {
    const period = await resolvePeriod(messId, yearMonth)
    const { start, end } = period

    // Summary first: it backfills missing logs, so the log query below sees them
    const summary = await calculatePeriodSummary(messId, period)

    // Neighbouring periods, so the page can step back and forward through real periods
    const [prev, next] = await Promise.all([
      prisma.messMonth.findFirst({ where: { messId, startDate: { lt: period.startDate } }, orderBy: { startDate: 'desc' }, select: { yearMonth: true } }),
      prisma.messMonth.findFirst({ where: { messId, startDate: { gt: period.startDate } }, orderBy: { startDate: 'asc' }, select: { yearMonth: true } }),
    ])

    const [settings, members, logs] = await Promise.all([
      getMessSettings(messId),
      prisma.member.findMany({
        // A closed month keeps everyone who was in it, even members who left later
        where: period.isClosed ? { messId, id: { in: Array.from(summary.members.keys()) } } : { messId, isActive: true },
        select: { id: true, name: true, role: true, isGuest: true, guestFrom: true, guestUntil: true },
        orderBy: { joinedAt: 'asc' },
      }),
      prisma.dailyLog.findMany({
        where: { messId, logDate: { gte: start, lte: end } },
        select: {
          id: true,
          memberId: true,
          logDate: true,
          breakfastCount: true,
          lunchCount: true,
          dinnerCount: true,
          guestCount: true,
          guestBreakfast: true,
          guestLunch: true,
          guestDinner: true,
          frozen: true,
        },
      }),
    ])

    const memberRows = members.map((member) => {
      const memberLogs = logs.filter((l) => l.memberId === member.id)
      const s = summary.forMember(member.id)

      return {
        member_id: member.id,
        member_name: member.name,
        member_role: member.role,
        is_guest: member.isGuest,
        guest_from: member.guestFrom?.toISOString().slice(0, 10) ?? null,
        guest_until: member.guestUntil?.toISOString().slice(0, 10) ?? null,
        days: memberLogs.map((l) => ({
          log_id: l.id,
          member_id: l.memberId,
          member_name: member.name,
          date: l.logDate.toISOString().slice(0, 10),
          breakfast_count: l.breakfastCount,
          lunch_count: l.lunchCount,
          dinner_count: l.dinnerCount,
          // Convenience booleans for UI
          breakfast: l.breakfastCount > 0,
          lunch: l.lunchCount > 0,
          dinner: l.dinnerCount > 0,
          guest_count: l.guestCount,
          // Guests per meal (older days: guests ate every meal the host ate)
          guests: guestsBySlot(l),
          guest_meals: guestMeals(l),
          frozen: l.frozen,
        })),
        own_meals: s.ownMeals,
        guest_meals: s.guestMeals,
        total_meals: s.billableMeals,
        total_amount: s.mealCost,
        contributed: s.contributed,
        balance: s.balance,
      }
    })

    return NextResponse.json({
      mess_id: messId,
      mess_name: settings?.name ?? '',
      year_month: period.yearMonth,
      start_date: period.startDate.toISOString().slice(0, 10),
      end_date: period.endDate.toISOString().slice(0, 10),
      is_closed: period.isClosed,
      prev_year_month: prev?.yearMonth ?? null,
      next_year_month: next?.yearMonth ?? null,
      meal_rate: summary.mealRate,
      total_expense: summary.totalExpense,
      total_meals: summary.totalMeals,
      total_guest_meals: summary.totalGuestMeals,
      guest_meal_policy: summary.guestMealPolicy,
      carry_forward_balance: settings?.carryForwardBalance ?? true,
      weekend_days: settings?.weekendDays ?? [5, 6],
      members: memberRows,
    })
  } catch (err) {
    console.error('[GET /api/admin/matrix] messId=%s', messId, err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
