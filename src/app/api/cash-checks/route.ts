import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { createAuditTx } from '@/lib/audit'
import { expectedFrom, fundBookTotal, round2 } from '@/lib/cash-check'

// Counting the mess fund against the book. See src/lib/cash-check.ts for the rules.

const HISTORY = 10
const MAX_AMOUNT = 100_000_000
const MAX_NOTE = 200

type CheckRow = {
  id: string
  countedAmount: unknown
  bookTotal: unknown
  expectedAmount: unknown
  difference: unknown
  note: string | null
  createdAt: Date
  creator: { name: string } | null
}

const toJson = (c: CheckRow) => ({
  id: c.id,
  counted_amount: Number(c.countedAmount),
  expected_amount: c.expectedAmount === null ? null : Number(c.expectedAmount),
  difference: c.difference === null ? null : Number(c.difference),
  note: c.note,
  created_by_name: c.creator?.name ?? null,
  created_at: c.createdAt.toISOString(),
})

const CHECK_SELECT = {
  id: true, countedAmount: true, bookTotal: true, expectedAmount: true, difference: true,
  note: true, createdAt: true, creator: { select: { name: true } },
} as const

// ── GET /api/cash-checks ─────────────────────────────────────────────────────
// Every member can see the checks: the point is that the whole mess can trust the fund.

export async function GET(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  try {
    const [history, { book, bazaarFromFund }] = await Promise.all([
      prisma.cashCheck.findMany({
        where: { messId: payload.messId },
        orderBy: { createdAt: 'desc' },
        take: HISTORY,
        select: CHECK_SELECT,
      }),
      fundBookTotal(payload.messId),
    ])
    const last = history[0] ?? null
    const expectedNow = expectedFrom(
      last ? { countedAmount: Number(last.countedAmount), bookTotal: Number(last.bookTotal) } : null,
      book,
    )

    return NextResponse.json({
      expected_now: expectedNow,
      bazaar_from_fund: bazaarFromFund,
      last_check: last ? toJson(last) : null,
      history: history.map(toJson),
    })
  } catch (err) {
    console.error('[GET /api/cash-checks]', err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}

// ── POST /api/cash-checks ────────────────────────────────────────────────────
// Admin or manager records what the fund really holds. Body: { counted_amount, note? }

export async function POST(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  if (payload.role !== 'ADMIN' && payload.role !== 'MANAGER') {
    return NextResponse.json({ detail: 'Only Admin or Manager can count the fund' }, { status: 403 })
  }

  let body: { counted_amount?: unknown; note?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ detail: 'Invalid request body' }, { status: 400 })
  }

  const counted = Number(body.counted_amount)
  if (body.counted_amount === undefined || body.counted_amount === null || body.counted_amount === ''
    || !Number.isFinite(counted) || counted < 0 || counted > MAX_AMOUNT) {
    return NextResponse.json({ detail: 'Enter the amount you counted, 0 or more' }, { status: 400 })
  }
  if (body.note !== undefined && body.note !== null && typeof body.note !== 'string') {
    return NextResponse.json({ detail: 'Note must be text' }, { status: 400 })
  }
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null
  if (note && note.length > MAX_NOTE) {
    return NextResponse.json({ detail: `Note can be at most ${MAX_NOTE} characters` }, { status: 400 })
  }

  try {
    const { book } = await fundBookTotal(payload.messId)
    const countedAmount = round2(counted)

    const check = await prisma.$transaction(async (tx) => {
      const last = await tx.cashCheck.findFirst({
        where: { messId: payload.messId },
        orderBy: { createdAt: 'desc' },
        select: { countedAmount: true, bookTotal: true },
      })
      const expected = expectedFrom(
        last ? { countedAmount: Number(last.countedAmount), bookTotal: Number(last.bookTotal) } : null,
        book,
      )
      const difference = expected === null ? null : round2(countedAmount - expected)

      const row = await tx.cashCheck.create({
        data: {
          messId: payload.messId,
          countedAmount,
          bookTotal: book,
          expectedAmount: expected,
          difference,
          note,
          createdBy: payload.sub,
        },
        select: CHECK_SELECT,
      })

      await createAuditTx(tx, {
        messId: payload.messId,
        actorId: payload.sub,
        action: 'CASH_CHECK',
        targetTable: 'cash_checks',
        targetId: row.id,
        newValue: { counted_amount: countedAmount, expected_amount: expected, difference, note },
      })
      return row
    })

    return NextResponse.json(toJson(check), { status: 201 })
  } catch (err) {
    console.error('[POST /api/cash-checks]', err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
