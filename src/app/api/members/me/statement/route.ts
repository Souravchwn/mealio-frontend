/**
 * GET /api/members/me/statement?year_month=YYYY-MM[&member_id=<uuid>]
 *
 * One member's statement for a billing period: the same figures as My Summary (all from
 * calculatePeriodSummary, never recalculated here), plus the day-by-day meals and the
 * deposits behind them. Used by the printable statement page (save as PDF, share).
 *
 * A member sees their own statement. ADMIN and MANAGER may pass member_id to see anyone in
 * their own mess (the mess always comes from the token).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { calculatePeriodSummary, endOfPeriodExclusive } from '@/lib/financial'
import { resolvePeriod } from '@/lib/period'
import { requireMessSettings, todayIn, dateIn } from '@/lib/mess-settings'
import { dayGuestMeals, GUEST_SELECT } from '@/lib/guests'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const yearMonth = searchParams.get('year_month') || null
  const requested = searchParams.get('member_id')

  let memberId = payload.sub
  if (requested && requested !== payload.sub) {
    if (payload.role !== 'ADMIN' && payload.role !== 'MANAGER') {
      return NextResponse.json({ detail: 'You can only see your own statement' }, { status: 403 })
    }
    if (!UUID.test(requested)) return NextResponse.json({ detail: 'Member not found' }, { status: 404 })
    memberId = requested
  }

  try {
    const [member, mess] = await Promise.all([
      prisma.member.findFirst({
        // Only a member of the caller's own mess
        where: { id: memberId, messId: payload.messId },
        select: { id: true, name: true, joinedAt: true, deletedAt: true },
      }),
      prisma.mess.findUnique({ where: { id: payload.messId }, select: { name: true } }),
    ])
    if (!member || !mess) return NextResponse.json({ detail: 'Member not found' }, { status: 404 })

    const period = await resolvePeriod(payload.messId, yearMonth)
    const summary = await calculatePeriodSummary(payload.messId, period)
    const me = summary.forMember(member.id)
    const settings = await requireMessSettings(payload.messId)

    // Same day range the bill uses: an open period counts meals only up to today
    const todayObj = new Date(`${todayIn(settings.timezone)}T00:00:00.000Z`)
    const mealEnd = !period.isClosed && todayObj < period.endDate ? todayObj : period.endDate
    const joined = dateIn(member.joinedAt, settings.timezone)

    const [logs, deposits] = await Promise.all([
      prisma.dailyLog.findMany({
        where: { messId: payload.messId, memberId: member.id, logDate: { gte: period.startDate, lte: mealEnd } },
        select: { logDate: true, breakfastCount: true, lunchCount: true, dinnerCount: true, ...GUEST_SELECT },
        orderBy: { logDate: 'asc' },
      }),
      prisma.ledgerEntry.findMany({
        where: {
          messId: payload.messId,
          memberId: member.id,
          entryType: 'CONTRIBUTION',
          isVoided: false,
          createdAt: { gte: period.startDate, lt: endOfPeriodExclusive(period.endDate) },
        },
        select: { createdAt: true, amount: true, paymentMethod: true, reference: true },
        orderBy: { createdAt: 'asc' },
      }),
    ])

    const days = logs
      .map((l) => ({ ...l, date: l.logDate.toISOString().slice(0, 10) }))
      .filter((l) => l.date >= joined) // rows dated before the member joined are not billed
      .map((l) => ({
        date: l.date,
        breakfast: l.breakfastCount,
        lunch: l.lunchCount,
        dinner: l.dinnerCount,
        guests: dayGuestMeals(l),
      }))

    return NextResponse.json({
      mess_name: mess.name,
      member_id: member.id,
      member_name: member.deletedAt ? 'Former member' : member.name,
      year_month: period.yearMonth,
      start_date: period.startDate.toISOString().slice(0, 10),
      end_date: period.endDate.toISOString().slice(0, 10),
      is_closed: period.isClosed,
      generated_at: new Date().toISOString(),
      meal_rate: summary.mealRate,
      total_expense: summary.totalExpense,
      guest_meal_policy: summary.guestMealPolicy,
      own_meal_count: me.ownMeals,
      guest_meal_count: me.guestMeals,
      my_meal_count: me.billableMeals,
      deposited: me.deposited,
      bazaar_credit: me.bazaarCredit,
      carried_forward: me.carriedForward,
      contributed: me.contributed,
      meal_cost: me.mealCost,
      balance: me.balance,
      days,
      deposits: deposits.map((d) => ({
        date: dateIn(d.createdAt, settings.timezone),
        amount: Number(d.amount),
        method: d.paymentMethod,
        reference: d.reference,
      })),
    })
  } catch (err) {
    console.error('[GET /api/members/me/statement] member=%s', memberId, err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
