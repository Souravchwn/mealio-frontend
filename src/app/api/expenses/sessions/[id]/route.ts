import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { createAuditTx } from '@/lib/audit'

type Params = { params: Promise<{ id: string }> }

async function getSession(id: string, messId: string) {
  return prisma.bazaarSession.findFirst({
    where: { id, messId },
    include: {
      creator: { select: { name: true } },
      expenses: {
        select: { id: true, amount: true, category: true, description: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
}

export async function GET(req: NextRequest, { params }: Params) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const session = await getSession(id, payload.messId)
  if (!session) return NextResponse.json({ detail: 'Session not found' }, { status: 404 })

  return NextResponse.json({
    id: session.id,
    mess_id: session.messId,
    date: session.sessionDate.toISOString().slice(0, 10),
    year_month: session.yearMonth,
    shoppers: session.shoppers,
    note: session.note,
    created_by_name: session.creator?.name ?? null,
    total: session.expenses.reduce((sum, e) => sum + Number(e.amount), 0),
    items: session.expenses.map((e) => ({
      id: e.id,
      category: e.category,
      amount: Number(e.amount),
      description: e.description,
    })),
    created_at: session.createdAt.toISOString(),
  })
}

export async function PUT(req: NextRequest, { params }: Params) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  if (payload.role !== 'ADMIN' && payload.role !== 'MANAGER') {
    return NextResponse.json({ detail: 'Admin or Manager access required' }, { status: 403 })
  }

  const { id } = await params
  const session = await prisma.bazaarSession.findFirst({
    where: { id, messId: payload.messId },
    select: { id: true, shoppers: true, note: true, sessionDate: true },
  })
  if (!session) return NextResponse.json({ detail: 'Session not found' }, { status: 404 })

  const body = await req.json()
  const { date, shoppers, items, note } = body as {
    date?: string
    shoppers?: Array<{ id: string; name: string }>
    items?: Array<{ category: string; amount: number; description?: string }>
    note?: string
  }

  if (items !== undefined && items.length === 0) {
    return NextResponse.json({ detail: 'Session must have at least one item' }, { status: 400 })
  }

  const updateData: Record<string, unknown> = {}
  if (date !== undefined) {
    updateData.sessionDate = new Date(`${date}T00:00:00.000Z`)
    updateData.yearMonth = date.slice(0, 7)
  }
  if (shoppers !== undefined) updateData.shoppers = shoppers
  if (note !== undefined) updateData.note = note || null

  try {
    await prisma.$transaction(async (tx) => {
      await tx.bazaarSession.update({ where: { id }, data: updateData })

      if (items !== undefined) {
        const expenseDate = date
          ? new Date(`${date}T00:00:00.000Z`)
          : session.sessionDate
        const yearMonth = date ? date.slice(0, 7) : session.sessionDate.toISOString().slice(0, 7)

        await tx.expense.deleteMany({ where: { sessionId: id } })
        await tx.expense.createMany({
          data: items.map((item) => ({
            messId: payload.messId,
            addedBy: payload.sub,
            sessionId: id,
            amount: Number(item.amount),
            category: item.category,
            description: item.description || null,
            expenseDate,
            yearMonth,
          })),
        })
      }

      await createAuditTx(tx, {
        messId: payload.messId,
        actorId: payload.sub,
        action: 'EDIT_BAZAAR_SESSION',
        targetTable: 'bazaar_sessions',
        targetId: id,
        oldValue: { shoppers: session.shoppers, note: session.note },
        newValue: updateData as object,
      })
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to update session'
    return NextResponse.json({ detail: msg }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  if (payload.role !== 'ADMIN') {
    return NextResponse.json({ detail: 'Admin access required' }, { status: 403 })
  }

  let body: { reason?: unknown }
  try { body = await req.json() } catch { body = {} }
  const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : null
  if (!reason) {
    return NextResponse.json({ detail: 'A reason is required to void a session' }, { status: 400 })
  }

  const { id } = await params
  const session = await prisma.bazaarSession.findFirst({
    where: { id, messId: payload.messId },
    select: { id: true, sessionDate: true, shoppers: true, isVoided: true },
  })
  if (!session) return NextResponse.json({ detail: 'Session not found' }, { status: 404 })
  if (session.isVoided) return NextResponse.json({ detail: 'Session is already voided' }, { status: 400 })

  try {
    await prisma.$transaction(async (tx) => {
      await tx.bazaarSession.update({
        where: { id },
        data: { isVoided: true, voidReason: reason, voidedAt: new Date(), voidedBy: payload.sub },
      })
      await createAuditTx(tx, {
        messId: payload.messId,
        actorId: payload.sub,
        action: 'VOID_BAZAAR_SESSION',
        targetTable: 'bazaar_sessions',
        targetId: id,
        oldValue: { date: session.sessionDate.toISOString().slice(0, 10), shoppers: session.shoppers },
        newValue: { voided: true, reason },
      })
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[DELETE /api/expenses/sessions/%s]', id, err)
    return NextResponse.json({ detail: 'Failed to void session. Please try again.' }, { status: 500 })
  }
}
