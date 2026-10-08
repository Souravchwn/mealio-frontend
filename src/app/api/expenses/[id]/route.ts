import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { createAuditTx } from '@/lib/audit'
import { isDateInClosedPeriod, checkDateInOpenPeriod } from '@/lib/period'
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '@/lib/constants'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  if (payload.role !== 'ADMIN' && payload.role !== 'MANAGER') {
    return NextResponse.json({ detail: 'Admin or Manager access required' }, { status: 403 })
  }

  const { id } = await params
  const expense = await prisma.expense.findUnique({
    where: { id },
    select: { id: true, messId: true, amount: true, category: true, expenseDate: true },
  })
  if (!expense || expense.messId !== payload.messId) {
    return NextResponse.json({ detail: 'Expense not found' }, { status: 404 })
  }
  if (await isDateInClosedPeriod(payload.messId, expense.expenseDate)) {
    return NextResponse.json({ detail: 'That date is in a closed month and can no longer be changed' }, { status: 400 })
  }

  const { amount, category, description, date } = await req.json()
  const updateData: Record<string, unknown> = {}

  if (amount !== undefined) {
    const num = Number(amount)
    if (isNaN(num) || num <= 0) {
      return NextResponse.json({ detail: 'Amount must be a positive number' }, { status: 400 })
    }
    updateData.amount = num
  }
  if (category !== undefined) {
    if (!EXPENSE_CATEGORIES.includes(category as ExpenseCategory)) {
      return NextResponse.json({ detail: 'Invalid expense category' }, { status: 400 })
    }
    updateData.category = category
  }
  if (description !== undefined) updateData.description = description || null
  if (date !== undefined) {
    if (typeof date !== 'string' || !DATE_RE.test(date)) {
      return NextResponse.json({ detail: 'Date must be YYYY-MM-DD' }, { status: 400 })
    }
    const dateCheck = await checkDateInOpenPeriod(payload.messId, new Date(`${date}T00:00:00.000Z`))
    if (!dateCheck.ok) return NextResponse.json({ detail: dateCheck.detail, code: 'DATE_OUTSIDE_PERIOD' }, { status: 400 })
    updateData.expenseDate = new Date(`${date as string}T00:00:00.000Z`)
    updateData.yearMonth = (date as string).slice(0, 7)
  }

  await prisma.$transaction((tx) =>
    Promise.all([
      tx.expense.update({ where: { id }, data: updateData }),
      createAuditTx(tx, {
        messId: payload.messId,
        actorId: payload.sub,
        action: 'ADMIN_EXPENSE_EDIT',
        targetTable: 'expenses',
        targetId: id,
        oldValue: { amount: Number(expense.amount), category: expense.category },
        newValue: updateData as object,
      }),
    ]),
  )

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  if (payload.role !== 'ADMIN' && payload.role !== 'MANAGER') {
    return NextResponse.json({ detail: 'Admin or Manager access required' }, { status: 403 })
  }

  const { id } = await params
  const expense = await prisma.expense.findUnique({
    where: { id },
    select: { id: true, messId: true, amount: true, category: true, expenseDate: true },
  })
  if (!expense || expense.messId !== payload.messId) {
    return NextResponse.json({ detail: 'Expense not found' }, { status: 404 })
  }
  if (await isDateInClosedPeriod(payload.messId, expense.expenseDate)) {
    return NextResponse.json({ detail: 'That date is in a closed month and can no longer be changed' }, { status: 400 })
  }

  const oldValue = {
    amount: Number(expense.amount),
    category: expense.category,
    date: expense.expenseDate.toISOString().slice(0, 10),
  }

  await prisma.$transaction((tx) =>
    Promise.all([
      tx.expense.delete({ where: { id } }),
      createAuditTx(tx, {
        messId: payload.messId,
        actorId: payload.sub,
        action: 'ADMIN_EXPENSE_DELETE',
        targetTable: 'expenses',
        targetId: id,
        oldValue,
      }),
    ]),
  )

  return NextResponse.json({ ok: true })
}
