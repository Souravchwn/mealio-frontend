import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { countMealSlots, calculateMemberBalance, nonVoidedExpenseWhere } from '@/lib/financial'
import { resolvePeriod } from '@/lib/period'

export async function GET(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const yearMonth = searchParams.get('year_month') || null

  // Resolve to actual period dates
  const period = await resolvePeriod(payload.messId, yearMonth)
  const { start, end } = period

  const [member, myLogs, myExpenses, contributions] = await Promise.all([
    // Fetch joinedAt to exclude phantom logs created before the member joined
    prisma.member.findUnique({
      where: { id: payload.sub },
      select: { joinedAt: true },
    }),
    prisma.dailyLog.findMany({
      where: { memberId: payload.sub, logDate: { gte: start, lte: end } },
      select: { breakfastCount: true, lunchCount: true, dinnerCount: true, guestCount: true, logDate: true },
    }),
    // Member's own expense contributions — exclude voided sessions
    prisma.expense.findMany({
      where: { addedBy: payload.sub, ...nonVoidedExpenseWhere(payload.messId, start, end) },
      select: { amount: true },
    }),
    // Cash contributions — exclude voided entries
    prisma.ledgerEntry.findMany({
      where: {
        memberId: payload.sub, messId: payload.messId,
        entryType: 'CONTRIBUTION', isVoided: false,
        createdAt: { gte: start, lte: end },
      },
      select: { amount: true },
    }),
  ])

  // Calculate stats from the same date range
  const totalExpense = myExpenses.reduce((s, e) => s + Number(e.amount), 0)
  // Get mess-wide stats for mealRate
  const allLogs = await prisma.dailyLog.findMany({
    where: { messId: payload.messId, logDate: { gte: start, lte: end } },
    select: { breakfastCount: true, lunchCount: true, dinnerCount: true, guestCount: true },
  })
  const allExpenses = await prisma.expense.findMany({
    where: nonVoidedExpenseWhere(payload.messId, start, end),
    select: { amount: true },
  })
  const messTotalExpense = allExpenses.reduce((s, e) => s + Number(e.amount), 0)
  const messTotalMeals = countMealSlots(allLogs)
  const mealRate = messTotalMeals > 0 ? messTotalExpense / messTotalMeals : 0

  // Only count meals from the day the member joined — prevents phantom logs
  // created before joinedAt from inflating meal counts and balance
  const joinedAt = member?.joinedAt ?? start
  const validMyLogs = myLogs.filter((l) => l.logDate >= joinedAt)

  const myMealCount = countMealSlots(validMyLogs)
  // contributed = expenses added by member + cash contributions recorded this period
  const expenseContribution = myExpenses.reduce((s, e) => s + Number(e.amount), 0)
  const cashContribution = contributions.reduce((s, e) => s + Number(e.amount), 0)
  const contributed = expenseContribution + cashContribution
  const mealCost = myMealCount * mealRate

  return NextResponse.json({
    member_id:     payload.sub,
    year_month:    period.yearMonth,
    start_date:    period.startDate.toISOString().slice(0, 10),
    end_date:      period.endDate.toISOString().slice(0, 10),
    meal_rate:     mealRate,
    total_expense: messTotalExpense,
    my_meal_count: myMealCount,
    contributed,
    meal_cost:     mealCost,
    balance:       calculateMemberBalance(contributed, myMealCount, mealRate),
  })
}
