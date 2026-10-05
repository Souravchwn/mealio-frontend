import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { calculateMonthStats } from '@/lib/financial'
import { resolvePeriod } from '@/lib/period'
import { createAuditTx } from '@/lib/audit'

export async function GET(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const messId = searchParams.get('mess_id') || payload.messId
  const yearMonth = searchParams.get('year_month') || null
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)))

  // Resolve to actual period dates
  const period = await resolvePeriod(messId, yearMonth)
  const { start, end } = period

  const [sessions, total, { mealRate: liveMealRate, totalExpense }] = await Promise.all([
    prisma.bazaarSession.findMany({
      where: { messId, sessionDate: { gte: start, lte: end } },
      include: {
        creator: { select: { name: true } },
        expenses: {
          select: { id: true, amount: true, category: true, description: true },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { sessionDate: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.bazaarSession.count({
      where: { messId, sessionDate: { gte: start, lte: end } },
    }),
    // Single call — returns totalExpense + totalMeals + mealRate, all voided-excluded
    calculateMonthStats(messId, period.yearMonth),
  ])

  return NextResponse.json({
    sessions: sessions.map((s) => ({
      id: s.id,
      mess_id: s.messId,
      date: s.sessionDate.toISOString().slice(0, 10),
      year_month: s.yearMonth,
      shoppers: s.shoppers,
      note: s.note,
      created_by_name: s.creator?.name ?? null,
      total: s.expenses.reduce((sum, e) => sum + Number(e.amount), 0),
      items: s.expenses.map((e) => ({
        id: e.id,
        category: e.category,
        amount: Number(e.amount),
        description: e.description,
      })),
      created_at: s.createdAt.toISOString(),
      is_voided: s.isVoided,
      void_reason: s.voidReason ?? null,
      voided_at: s.voidedAt?.toISOString() ?? null,
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
    live_meal_rate: liveMealRate,
    total_expense: totalExpense,
  })
}

export async function POST(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  if (payload.role !== 'ADMIN' && payload.role !== 'MANAGER') {
    return NextResponse.json({ detail: 'Only Admin or Manager can add bazaar sessions' }, { status: 403 })
  }

  const body = await req.json()
  const { date, shoppers, items, note } = body as {
    date: string
    shoppers: Array<{ id: string; name: string }>
    items: Array<{ category: string; amount: number; description?: string }>
    note?: string
  }

  if (!date || !items || items.length === 0) {
    return NextResponse.json({ detail: 'date and at least one item are required' }, { status: 400 })
  }

  for (const item of items) {
    if (!item.category || !item.amount) {
      return NextResponse.json({ detail: 'Each item must have a category and amount' }, { status: 400 })
    }
    const num = Number(item.amount)
    if (isNaN(num) || num <= 0) {
      return NextResponse.json({ detail: 'All item amounts must be positive numbers' }, { status: 400 })
    }
  }

  const yearMonth = (date as string).slice(0, 7)
  const sessionDate = new Date(`${date as string}T00:00:00.000Z`)

  try {
    const result = await prisma.$transaction(async (tx) => {
      const session = await tx.bazaarSession.create({
        data: {
          messId: payload.messId,
          sessionDate,
          yearMonth,
          shoppers: shoppers ?? [],
          note: note || null,
          createdBy: payload.sub,
        },
      })

      await tx.expense.createMany({
        data: items.map((item) => ({
          messId: payload.messId,
          addedBy: payload.sub,
          sessionId: session.id,
          amount: Number(item.amount),
          category: item.category,
          description: item.description || null,
          expenseDate: sessionDate,
          yearMonth,
        })),
      })

      await createAuditTx(tx, {
        messId: payload.messId,
        actorId: payload.sub,
        action: 'ADD_BAZAAR_SESSION',
        targetTable: 'bazaar_sessions',
        targetId: session.id,
        newValue: {
          date,
          shoppers: shoppers ?? [],
          item_count: items.length,
          total: items.reduce((s, i) => s + Number(i.amount), 0),
        },
      })

      return session
    })

    const created = await prisma.bazaarSession.findUnique({
      where: { id: result.id },
      include: {
        creator: { select: { name: true } },
        expenses: {
          select: { id: true, amount: true, category: true, description: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    return NextResponse.json({
      id: created!.id,
      mess_id: created!.messId,
      date: created!.sessionDate.toISOString().slice(0, 10),
      year_month: created!.yearMonth,
      shoppers: created!.shoppers,
      note: created!.note,
      created_by_name: created!.creator?.name ?? null,
      total: created!.expenses.reduce((sum, e) => sum + Number(e.amount), 0),
      items: created!.expenses.map((e) => ({
        id: e.id,
        category: e.category,
        amount: Number(e.amount),
        description: e.description,
      })),
      created_at: created!.createdAt.toISOString(),
    }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/expenses/sessions]', err)
    return NextResponse.json({ detail: 'Failed to create bazaar session. Please try again.' }, { status: 500 })
  }
}
