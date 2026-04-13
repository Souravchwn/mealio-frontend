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

  const [mess, members, expenses, logs] = await Promise.all([
    prisma.mess.findUnique({ where: { id: messId }, select: { name: true } }),
    prisma.member.findMany({
      where: { messId, isActive: true },
      select: { id: true, name: true, phone: true, role: true, telegramLinked: true, isGuest: true, guestFrom: true, guestUntil: true },
      orderBy: { joinedAt: 'asc' },
    }),
    prisma.expense.findMany({
      where: { messId, expenseDate: { gte: start, lte: end } },
      select: { amount: true, addedBy: true },
    }),
    prisma.dailyLog.findMany({
      where: { messId, logDate: { gte: start, lte: end } },
      select: { memberId: true, breakfastCount: true, lunchCount: true, dinnerCount: true, guestCount: true },
    }),
  ])

  const totalExpense = expenses.reduce((s, e) => s + Number(e.amount), 0)
  const totalMeals = countMealSlots(logs)
  const mealRate = totalMeals > 0 ? totalExpense / totalMeals : 0

  return NextResponse.json({
    mess_name: mess?.name ?? '',
    members: members.map((member) => {
      const memberMeals = countMealSlots(logs.filter((l) => l.memberId === member.id))
      const contributed = expenses
        .filter((e) => e.addedBy === member.id)
        .reduce((s, e) => s + Number(e.amount), 0)

      return {
        id: member.id,
        name: member.name,
        phone: member.phone,
        role: member.role,
        balance: calculateMemberBalance(contributed, memberMeals, mealRate),
        telegram_linked: member.telegramLinked,
        is_guest: member.isGuest,
        guest_from: member.guestFrom?.toISOString().slice(0, 10) ?? null,
        guest_until: member.guestUntil?.toISOString().slice(0, 10) ?? null,
      }
    }),
  })
}
