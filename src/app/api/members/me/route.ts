import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { monthRange, countMealSlots } from '@/lib/financial'

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
      select: { breakfast: true, lunch: true, dinner: true, guestCount: true },
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
      select: { breakfast: true, lunch: true, dinner: true, guestCount: true },
    }),
  ])

  const totalExpense = allExpenses.reduce((s, e) => s + Number(e.amount), 0)
  const totalMeals = countMealSlots(allLogs)
  const mealRate = totalMeals > 0 ? totalExpense / totalMeals : 0

  const myMealCount = countMealSlots(myLogs)
  const contributed = myExpenses.reduce((s, e) => s + Number(e.amount), 0)
  const mealCost = myMealCount * mealRate

  return NextResponse.json({
    member_id: payload.sub,
    year_month: yearMonth,
    meal_rate: mealRate,
    my_meal_count: myMealCount,
    contributed,
    meal_cost: mealCost,
    balance: contributed - mealCost,
  })
}
