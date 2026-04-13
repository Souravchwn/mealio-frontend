import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { monthRange, countMealSlots, calculateMemberBalance } from '@/lib/financial'

export async function GET(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  if (payload.role !== 'ADMIN' && payload.role !== 'MANAGER') {
    return NextResponse.json({ detail: 'Admin or Manager access required' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const messId = searchParams.get('mess_id') || payload.messId
  const yearMonth = searchParams.get('year_month') || new Date().toISOString().slice(0, 7)
  const { start, end } = monthRange(yearMonth)

  const [mess, members, logs, expenses] = await Promise.all([
    prisma.mess.findUnique({ where: { id: messId }, select: { name: true } }),
    prisma.member.findMany({
      where: { messId, isActive: true },
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
        frozen: true,
      },
    }),
    prisma.expense.findMany({
      where: { messId, expenseDate: { gte: start, lte: end } },
      select: { amount: true, addedBy: true },
    }),
  ])

  const totalExpense = expenses.reduce((s, e) => s + Number(e.amount), 0)
  const totalMeals = countMealSlots(logs)
  const mealRate = totalMeals > 0 ? totalExpense / totalMeals : 0

  const memberRows = members.map((member) => {
    const memberLogs = logs.filter((l) => l.memberId === member.id)
    const memberMeals = countMealSlots(memberLogs)
    const memberExpenses = expenses
      .filter((e) => e.addedBy === member.id)
      .reduce((s, e) => s + Number(e.amount), 0)
    const totalAmount = memberMeals * mealRate

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
        frozen: l.frozen,
      })),
      total_meals: memberMeals,
      total_amount: totalAmount,
      balance: calculateMemberBalance(memberExpenses, memberMeals, mealRate),
    }
  })

  return NextResponse.json({
    mess_id: messId,
    mess_name: mess?.name ?? '',
    year_month: yearMonth,
    meal_rate: mealRate,
    total_expense: totalExpense,
    total_meals: totalMeals,
    members: memberRows,
  })
}
