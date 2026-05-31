import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { monthRange, countMealSlots, calculateMemberBalance } from '@/lib/financial'

export async function GET(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const yearMonth = searchParams.get('year_month') || new Date().toISOString().slice(0, 7)
  const { start, end } = monthRange(yearMonth)

  const [myLogs, myExpenses, allExpenses, allLogs] = await Promise.all([
    prisma.dailyLog.findMany({
      where: { memberId: payload.sub, logDate: { gte: start, lte: end } },
      select: {
        breakfastCount: true, lunchCount: true, dinnerCount: true,
        guestBreakfastCount: true, guestLunchCount: true, guestDinnerCount: true,
      },
    }),
    prisma.expense.findMany({
      where: { addedBy: payload.sub, expenseDate: { gte: start, lte: end } },
      select: { amount: true },
    }),
    prisma.expense.findMany({
      where: { messId: payload.messId, expenseDate: { gte: start, lte: end } },
      select: { amount: true },
    }),
    prisma.dailyLog.findMany({
      where: { messId: payload.messId, logDate: { gte: start, lte: end } },
      select: {
        breakfastCount: true, lunchCount: true, dinnerCount: true,
        guestBreakfastCount: true, guestLunchCount: true, guestDinnerCount: true,
      },
    }),
  ])

  const totalExpense = allExpenses.reduce((s, e) => s + Number(e.amount), 0)
  const totalMeals = countMealSlots(allLogs)
  const mealRate = totalMeals > 0 ? totalExpense / totalMeals : 0

  const myMealCount = countMealSlots(myLogs)
  const contributed = myExpenses.reduce((s, e) => s + Number(e.amount), 0)
  const mealCost = myMealCount * mealRate

  // Per-slot own meals + guest meals (for the personal breakdown)
  const myBreakfast = myLogs.reduce((s, l) => s + l.breakfastCount, 0)
  const myLunch = myLogs.reduce((s, l) => s + l.lunchCount, 0)
  const myDinner = myLogs.reduce((s, l) => s + l.dinnerCount, 0)
  const myGuestMeals = myLogs.reduce(
    (s, l) => s + l.guestBreakfastCount + l.guestLunchCount + l.guestDinnerCount,
    0,
  )

  return NextResponse.json({
    member_id: payload.sub,
    year_month: yearMonth,
    meal_rate: mealRate,
    my_meal_count: myMealCount,
    my_breakfast_count: myBreakfast,
    my_lunch_count: myLunch,
    my_dinner_count: myDinner,
    my_guest_meals: myGuestMeals,
    contributed,
    meal_cost: mealCost,
    balance: calculateMemberBalance(contributed, myMealCount, mealRate),
  })
}
