import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { monthRange, calculateMealRate } from '@/lib/financial'

export async function GET(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const messId = searchParams.get('mess_id') || payload.messId
  const yearMonth = searchParams.get('year_month') || new Date().toISOString().slice(0, 7)
  const { start, end } = monthRange(yearMonth)

  const expenses = await prisma.expense.findMany({
    where: { messId, expenseDate: { gte: start, lte: end } },
    include: { addedByMember: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  })

  const liveMealRate = await calculateMealRate(messId, yearMonth)

  return NextResponse.json(
    expenses.map((e) => ({
      id: e.id,
      mess_id: e.messId,
      member_id: e.addedBy,
      member_name: e.addedByMember?.name ?? '',
      amount: Number(e.amount),
      category: e.category,
      description: e.description,
      date: e.expenseDate.toISOString().slice(0, 10),
      created_at: e.createdAt.toISOString(),
      live_meal_rate: liveMealRate,
    }))
  )
}

export async function POST(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  if (payload.role === 'MEMBER' || payload.role === 'GUEST') {
    return NextResponse.json({ detail: 'Only Admin or Manager can add expenses' }, { status: 403 })
  }

  const { mess_id, amount, category, description, date } = await req.json()

  if (!mess_id || !amount || !category || !date) {
    return NextResponse.json({ detail: 'mess_id, amount, category and date are required' }, { status: 400 })
  }

  const numAmount = Number(amount)
  if (isNaN(numAmount) || numAmount <= 0) {
    return NextResponse.json({ detail: 'Amount must be a positive number' }, { status: 400 })
  }

  const yearMonth = (date as string).slice(0, 7)

  try {
    const expense = await prisma.expense.create({
      data: {
        messId: mess_id,
        addedBy: payload.sub,
        amount,
        category,
        description: description || null,
        expenseDate: new Date(`${date as string}T00:00:00.000Z`),
        yearMonth,
      },
      include: { addedByMember: { select: { name: true } } },
    })

    const liveMealRate = await calculateMealRate(mess_id as string, yearMonth)

    return NextResponse.json({
      id: expense.id,
      mess_id: expense.messId,
      member_id: expense.addedBy,
      member_name: expense.addedByMember?.name ?? '',
      amount: Number(expense.amount),
      category: expense.category,
      description: expense.description,
      date: expense.expenseDate.toISOString().slice(0, 10),
      created_at: expense.createdAt.toISOString(),
      live_meal_rate: liveMealRate,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to add expense'
    return NextResponse.json({ detail: msg }, { status: 500 })
  }
}
