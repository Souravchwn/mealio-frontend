/**
 * GET /api/archive/[yearMonth]
 * One closed month in full: totals, every member's figures, every bazaar trip (with its memo
 * photos), every deposit (voided ones marked), and the day by day meals.
 * Open to every member of the mess. Figures come from the snapshot taken when the month was
 * closed, so they are exactly what was settled and cannot change afterwards.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { calculatePeriodSummary, endOfPeriodExclusive, guestMeals, ownMeals } from '@/lib/financial'
import { getPeriodByLabel } from '@/lib/period'
import { MEMO_SELECT, serializeMemo } from '@/lib/memos'

const YEAR_MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/
type Ctx = { params: Promise<{ yearMonth: string }> }

export async function GET(req: NextRequest, { params }: Ctx) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  const { yearMonth } = await params
  if (!YEAR_MONTH_RE.test(yearMonth)) return NextResponse.json({ detail: 'Invalid month' }, { status: 400 })

  try {
    // The mess comes from the token, never from the request
    const period = await getPeriodByLabel(payload.messId, yearMonth)
    if (!period) return NextResponse.json({ detail: 'Month not found' }, { status: 404 })
    if (!period.isClosed) return NextResponse.json({ detail: 'This month is still open. The archive only shows closed months.' }, { status: 404 })

    const range = { start: period.startDate, end: period.endDate }
    const summary = await calculatePeriodSummary(payload.messId, { id: period.id, isClosed: true, ...range })
    const memberIds = Array.from(summary.members.keys())

    const [closedRow, members, sessions, deposits, logs] = await Promise.all([
      prisma.messMonth.findUnique({ where: { id: period.id }, select: { closedAt: true, snapshot: true } }),
      prisma.member.findMany({ where: { id: { in: memberIds } }, select: { id: true, name: true, deletedAt: true } }),
      prisma.bazaarSession.findMany({
        where: { messId: payload.messId, sessionDate: { gte: period.startDate, lte: period.endDate } },
        orderBy: [{ sessionDate: 'asc' }, { createdAt: 'asc' }],
        include: {
          creator: { select: { name: true } },
          expenses: { select: { id: true, amount: true, category: true, description: true }, orderBy: { createdAt: 'asc' } },
          memos: { select: MEMO_SELECT, orderBy: { createdAt: 'asc' } },
        },
      }),
      prisma.ledgerEntry.findMany({
        where: { messId: payload.messId, entryType: 'CONTRIBUTION', createdAt: { gte: period.startDate, lt: endOfPeriodExclusive(period.endDate) } },
        orderBy: { createdAt: 'asc' },
        include: { member: { select: { name: true } }, creator: { select: { name: true } } },
      }),
      prisma.dailyLog.findMany({
        where: { messId: payload.messId, logDate: { gte: period.startDate, lte: period.endDate }, memberId: { in: memberIds } },
        select: { memberId: true, logDate: true, breakfastCount: true, lunchCount: true, dinnerCount: true, guestCount: true, guestBreakfast: true, guestLunch: true, guestDinner: true },
      }),
    ])

    const nameOf = new Map(members.map((m) => [m.id, m.deletedAt ? 'Deleted member' : m.name]))

    // Day by day: the dates of the period, and per member the meals on each date
    const dates: string[] = []
    for (let t = period.startDate.getTime(); t <= period.endDate.getTime(); t += 86_400_000) dates.push(new Date(t).toISOString().slice(0, 10))
    const index = new Map(dates.map((d, i) => [d, i]))
    const own = new Map<string, number[]>()
    const guest = new Map<string, number[]>()
    for (const id of memberIds) {
      own.set(id, dates.map(() => 0))
      guest.set(id, dates.map(() => 0))
    }
    for (const l of logs) {
      const i = index.get(l.logDate.toISOString().slice(0, 10))
      if (i === undefined) continue
      own.get(l.memberId)![i] = ownMeals(l)
      guest.get(l.memberId)![i] = guestMeals(l)
    }

    const totalDeposits = deposits.filter((d) => !d.isVoided).reduce((s, d) => s + Number(d.amount), 0)

    return NextResponse.json({
      year_month: period.yearMonth,
      start_date: period.startDate.toISOString().slice(0, 10),
      end_date: period.endDate.toISOString().slice(0, 10),
      closed_at: closedRow?.closedAt?.toISOString() ?? null,
      frozen_at: (closedRow?.snapshot as { takenAt?: string } | null)?.takenAt ?? null,
      settings: {
        guest_meal_policy: summary.guestMealPolicy,
        bazaar_counts_as_deposit: summary.bazaarCountsAsDeposit,
      },
      totals: {
        total_expense: summary.totalExpense,
        total_meals: summary.totalMeals,
        total_guest_meals: summary.totalGuestMeals,
        meal_rate: summary.mealRate,
        total_deposits: totalDeposits,
      },
      members: memberIds
        .map((id) => {
          const m = summary.members.get(id)!
          return {
            id,
            name: nameOf.get(id) ?? 'Former member',
            own_meals: m.ownMeals,
            guest_meals: m.guestMeals,
            billable_meals: m.billableMeals,
            deposited: m.deposited,
            bazaar_credit: m.bazaarCredit,
            carried_forward: m.carriedForward,
            meal_cost: m.mealCost,
            balance: m.balance,
            daily_meals: own.get(id),
            daily_guest_meals: guest.get(id),
          }
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
      dates,
      bazaar: sessions.map((s) => ({
        id: s.id,
        date: s.sessionDate.toISOString().slice(0, 10),
        shoppers: s.shoppers,
        note: s.note,
        entry_mode: s.entryMode,
        recorded_by: s.creator?.name ?? null,
        is_voided: s.isVoided,
        void_reason: s.voidReason,
        total: s.expenses.reduce((sum, e) => sum + Number(e.amount), 0),
        items: s.expenses.map((e) => ({ id: e.id, category: e.category, amount: Number(e.amount), description: e.description })),
        memos: s.memos.map(serializeMemo),
      })),
      deposits: deposits.map((d) => ({
        id: d.id,
        member_id: d.memberId,
        member_name: nameOf.get(d.memberId) ?? d.member.name,
        amount: Number(d.amount),
        date: d.createdAt.toISOString().slice(0, 10),
        note: d.note,
        recorded_by: d.creator?.name ?? null,
        is_voided: d.isVoided,
        void_reason: d.voidReason,
      })),
    })
  } catch (err) {
    console.error('[GET /api/archive/[yearMonth]]', err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
