import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { resolvePeriod } from '@/lib/period'
import { endOfPeriodExclusive } from '@/lib/financial'
import { createAuditTx } from '@/lib/audit'

// ── GET /api/contributions ────────────────────────────────────────────────────
// Returns paginated deposit (CONTRIBUTION) entries for the current mess/period.
// Accessible to all authenticated members.

export async function GET(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const yearMonth = searchParams.get('year_month') || null
  const page      = Math.max(1, parseInt(searchParams.get('page')  || '1',  10))
  const limit     = Math.min(20, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)))

  // Resolve to actual period dates
  const period = await resolvePeriod(payload.messId, yearMonth)
  const { start, end } = period

  const baseWhere = { messId: payload.messId, entryType: 'CONTRIBUTION' as const, createdAt: { gte: start, lt: endOfPeriodExclusive(end) } }

  try {
    const [entries, total, totalContributedAgg, memberSummaryRaw] = await Promise.all([
      prisma.ledgerEntry.findMany({
        where: baseWhere,
        include: {
          member:  { select: { name: true } },
          creator: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.ledgerEntry.count({ where: baseWhere }),
      // Server-owns the non-voided total — no frontend arithmetic
      prisma.ledgerEntry.aggregate({
        where: { ...baseWhere, isVoided: false },
        _sum: { amount: true },
      }),
      // Per-member non-voided breakdown — no frontend grouping
      prisma.ledgerEntry.findMany({
        where: { ...baseWhere, isVoided: false },
        select: { memberId: true, amount: true, member: { select: { name: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    ])

    // Group per-member summary server-side
    const summaryMap = new Map<string, { memberId: string; memberName: string; total: number; count: number }>()
    for (const e of memberSummaryRaw) {
      const existing = summaryMap.get(e.memberId)
      if (existing) {
        existing.total  += Number(e.amount)
        existing.count  += 1
      } else {
        summaryMap.set(e.memberId, {
          memberId:   e.memberId,
          memberName: e.member.name,
          total:      Number(e.amount),
          count:      1,
        })
      }
    }
    const memberSummary = [...summaryMap.values()].sort((a, b) => b.total - a.total)

    return NextResponse.json({
      contributions: entries.map((e) => ({
        id:               e.id,
        member_id:        e.memberId,
        member_name:      e.member.name,
        amount:           Number(e.amount),
        note:             e.note,
        date:             e.createdAt.toISOString().slice(0, 10),
        recorded_by_name: e.creator?.name ?? null,
        created_at:       e.createdAt.toISOString(),
        is_voided:        e.isVoided,
        void_reason:      e.voidReason ?? null,
        voided_at:        e.voidedAt?.toISOString() ?? null,
      })),
      total,
      page,
      pages:              Math.ceil(total / limit),
      total_contributed:  Number(totalContributedAgg._sum.amount ?? 0),
      member_summary:     memberSummary.map((s) => ({
        member_id:   s.memberId,
        member_name: s.memberName,
        total:       s.total,
        count:       s.count,
      })),
    })
  } catch (err) {
    console.error('[GET /api/contributions]', err)
    return NextResponse.json({ detail: 'Failed to load deposits' }, { status: 500 })
  }
}

// ── POST /api/contributions ───────────────────────────────────────────────────
// Records a cash deposit for a member. Admin/Manager only.
// Creates a CONTRIBUTION ledger entry + audit log in a single transaction.

export async function POST(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  if (payload.role !== 'ADMIN' && payload.role !== 'MANAGER') {
    return NextResponse.json({ detail: 'Only Admin or Manager can record deposits' }, { status: 403 })
  }

  // ── Input validation ──────────────────────────────────────────────────────
  let body: { member_id?: unknown; amount?: unknown; note?: unknown; date?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ detail: 'Invalid request body' }, { status: 400 })
  }

  const { member_id, amount, note, date } = body

  if (!member_id || typeof member_id !== 'string') {
    return NextResponse.json({ detail: 'Member is required' }, { status: 400 })
  }
  if (!date || typeof date !== 'string') {
    return NextResponse.json({ detail: 'Date is required' }, { status: 400 })
  }

  const num = Number(amount)
  if (!amount || isNaN(num) || num <= 0) {
    return NextResponse.json({ detail: 'Amount must be a positive number' }, { status: 400 })
  }

  // ── Business rule checks ──────────────────────────────────────────────────
  const member = await prisma.member.findFirst({
    where: { id: member_id, messId: payload.messId },
    select: { id: true, name: true, isActive: true },
  })
  if (!member) {
    return NextResponse.json({ detail: 'Member not found' }, { status: 404 })
  }
  if (!member.isActive) {
    return NextResponse.json({ detail: 'Cannot record a deposit for an inactive member' }, { status: 400 })
  }

  // ── Persist ───────────────────────────────────────────────────────────────
  try {
    const entry = await prisma.$transaction(async (tx) => {
      const ledger = await tx.ledgerEntry.create({
        data: {
          messId:    payload.messId,
          memberId:  member_id,
          entryType: 'CONTRIBUTION',
          amount:    num,
          note:      typeof note === 'string' && note.trim() ? note.trim() : null,
          createdBy: payload.sub,
        },
        include: {
          member:  { select: { name: true } },
          creator: { select: { name: true } },
        },
      })

      await createAuditTx(tx, {
        messId:      payload.messId,
        actorId:     payload.sub,
        action:      'ADD_CONTRIBUTION',
        targetTable: 'ledger_entries',
        targetId:    ledger.id,
        newValue:    { member_id, amount: num, note: ledger.note },
      })

      return ledger
    })

    return NextResponse.json({
      id:               entry.id,
      member_id:        entry.memberId,
      member_name:      entry.member.name,
      amount:           Number(entry.amount),
      note:             entry.note,
      date,
      recorded_by_name: entry.creator?.name ?? null,
      created_at:       entry.createdAt.toISOString(),
    }, { status: 201 })

  } catch (err) {
    console.error('[POST /api/contributions] member=%s amount=%s', member_id, num, err)
    return NextResponse.json({ detail: 'Failed to record deposit. Please try again.' }, { status: 500 })
  }
}
