import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { createAuditTx } from '@/lib/audit'

type Params = { params: Promise<{ id: string }> }

// ── DELETE /api/contributions/[id] ───────────────────────────────────────────
// Soft-voids a CONTRIBUTION ledger entry. Admin only.
// The entry stays in the DB with is_voided=true + reason. Balance recalculates automatically.

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
    return NextResponse.json({ detail: 'A reason is required to void a deposit' }, { status: 400 })
  }

  const { id } = await params
  const entry = await prisma.ledgerEntry.findFirst({
    where: { id, messId: payload.messId, entryType: 'CONTRIBUTION' },
    select: { id: true, memberId: true, amount: true, isVoided: true },
  })
  if (!entry) return NextResponse.json({ detail: 'Deposit not found' }, { status: 404 })
  if (entry.isVoided) return NextResponse.json({ detail: 'Deposit is already voided' }, { status: 400 })

  try {
    await prisma.$transaction(async (tx) => {
      await tx.ledgerEntry.update({
        where: { id },
        data: { isVoided: true, voidReason: reason, voidedAt: new Date(), voidedBy: payload.sub },
      })
      await createAuditTx(tx, {
        messId: payload.messId,
        actorId: payload.sub,
        action: 'VOID_CONTRIBUTION',
        targetTable: 'ledger_entries',
        targetId: id,
        oldValue: { member_id: entry.memberId, amount: Number(entry.amount) },
        newValue: { voided: true, reason },
      })
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[DELETE /api/contributions/%s]', id, err)
    return NextResponse.json({ detail: 'Failed to void deposit. Please try again.' }, { status: 500 })
  }
}
