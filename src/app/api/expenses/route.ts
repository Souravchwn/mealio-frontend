import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { calculateMealRate, nonVoidedExpenseWhere } from '@/lib/financial'
import { resolvePeriod, checkDateInOpenPeriod } from '@/lib/period'
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '@/lib/constants'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  // Always the caller's own mess — never a mess id from the request
  const messId    = payload.messId
  const yearMonth = searchParams.get('year_month') || null
  const page      = Math.max(1, parseInt(searchParams.get('page')  || '1',  10))
  const limit     = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)))

  // Resolve to actual period dates
  const period = await resolvePeriod(messId, yearMonth)
  const { start, end } = period

  const where = nonVoidedExpenseWhere(messId, start, end)

  const [expenses, total, liveMealRate] = await Promise.all([
    prisma.expense.findMany({
      where,
      include: { addedByMember: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.expense.count({ where }),
    calculateMealRate(messId, period.yearMonth),
  ])

  return NextResponse.json({
    expenses: expenses.map((e) => ({
      id:             e.id,
      mess_id:        e.messId,
      member_id:      e.addedBy,
      member_name:    e.addedByMember?.name ?? '',
      amount:         Number(e.amount),
      category:       e.category,
      description:    e.description,
      date:           e.expenseDate.toISOString().slice(0, 10),
      created_at:     e.createdAt.toISOString(),
      live_meal_rate: liveMealRate,
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
  })
}

export async function POST(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  if (payload.role === 'MEMBER' || payload.role === 'GUEST') {
    return NextResponse.json({ detail: 'Only Admin or Manager can add expenses' }, { status: 403 })
  }

  let body: { amount?: unknown; category?: unknown; description?: unknown; date?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ detail: 'Invalid request body' }, { status: 400 })
  }
  // mess_id in the body is ignored — expenses always go to the caller's own mess
  const messId = payload.messId
  const { amount, category, description, date } = body

  if (!amount || !category || !date) {
    return NextResponse.json({ detail: 'amount, category and date are required' }, { status: 400 })
  }
  if (typeof date !== 'string' || !DATE_RE.test(date)) {
    return NextResponse.json({ detail: 'Date must be YYYY-MM-DD' }, { status: 400 })
  }
  if (!EXPENSE_CATEGORIES.includes(category as ExpenseCategory)) {
    return NextResponse.json({ detail: 'Invalid expense category' }, { status: 400 })
  }

  const numAmount = Number(amount)
  if (isNaN(numAmount) || numAmount <= 0) {
    return NextResponse.json({ detail: 'Amount must be a positive number' }, { status: 400 })
  }

  const expenseDate = new Date(`${date}T00:00:00.000Z`)
  const dateCheck = await checkDateInOpenPeriod(messId, expenseDate)
  if (!dateCheck.ok) return NextResponse.json({ detail: dateCheck.detail, code: 'DATE_OUTSIDE_PERIOD' }, { status: 400 })

  const yearMonth = date.slice(0, 7)

  try {
    const expense = await prisma.expense.create({
      data: {
        messId,
        addedBy: payload.sub,
        amount: numAmount,
        category: category as string,
        description: typeof description === 'string' && description.trim() ? description.trim() : null,
        expenseDate,
        yearMonth,
      },
      include: { addedByMember: { select: { name: true } } },
    })

    const liveMealRate = await calculateMealRate(messId, null)

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
    console.error('[POST /api/expenses] messId=%s', messId, err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
