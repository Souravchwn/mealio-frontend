/**
 * POST /api/members/claims/[id] { decision: 'approve' | 'reject' } (ADMIN)
 *
 * Someone joined with the invite code and said "I am <name>". Approving moves their email and
 * password onto that name-only member, who keeps every meal and taka already recorded.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { createAudit } from '@/lib/audit'
import { logSecurityEvent } from '@/lib/security-events'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'ADMIN') return NextResponse.json({ detail: 'Admin access required' }, { status: 403 })

  const { id } = await params
  let body: { decision?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ detail: 'Invalid request body' }, { status: 400 })
  }
  if (body.decision !== 'approve' && body.decision !== 'reject') {
    return NextResponse.json({ detail: 'decision must be approve or reject' }, { status: 400 })
  }

  try {
    const claim = await prisma.memberClaim.findFirst({
      where: { id, messId: payload.messId, status: 'PENDING' },
      select: { id: true, memberId: true, email: true, passwordHash: true, phone: true, name: true, member: { select: { name: true } } },
    })
    if (!claim) return NextResponse.json({ detail: 'This request was already handled.' }, { status: 404 })

    if (body.decision === 'reject') {
      await prisma.memberClaim.update({ where: { id }, data: { status: 'REJECTED', decidedAt: new Date() } })
    } else {
      const taken = await prisma.member.findUnique({ where: { email: claim.email }, select: { id: true } })
      if (taken) {
        await prisma.memberClaim.update({ where: { id }, data: { status: 'REJECTED', decidedAt: new Date() } })
        return NextResponse.json({ detail: 'This email now belongs to another account, so the request was closed.', code: 'EMAIL_TAKEN' }, { status: 400 })
      }
      const done = await prisma.$transaction(async (tx) => {
        // The name must still be unjoined at the moment of writing
        const res = await tx.member.updateMany({
          where: { id: claim.memberId, messId: payload.messId, passwordHash: null },
          data: { email: claim.email, passwordHash: claim.passwordHash, ...(claim.phone ? { phone: claim.phone } : {}) },
        })
        if (res.count !== 1) return false
        await tx.memberClaim.update({ where: { id }, data: { status: 'APPROVED', decidedAt: new Date() } })
        // Any other open claim or invite for this name is now void
        await tx.memberClaim.updateMany({
          where: { memberId: claim.memberId, status: 'PENDING' },
          data: { status: 'REJECTED', decidedAt: new Date() },
        })
        await tx.authToken.updateMany({
          where: { memberId: claim.memberId, purpose: 'INVITE', usedAt: null },
          data: { usedAt: new Date() },
        })
        return true
      })
      if (!done) {
        await prisma.memberClaim.update({ where: { id }, data: { status: 'REJECTED', decidedAt: new Date() } })
        return NextResponse.json({ detail: 'This person has already joined.', code: 'ALREADY_JOINED' }, { status: 400 })
      }
    }

    await createAudit({
      messId: payload.messId,
      actorId: payload.sub,
      action: 'MEMBER_CLAIMED',
      targetTable: 'members',
      targetId: claim.memberId,
      newValue: { decision: body.decision, as: claim.member.name, said_name: claim.name, via: 'invite_code' },
    })
    await logSecurityEvent({
      type: body.decision === 'approve' ? 'CLAIM_APPROVED' : 'CLAIM_REJECTED',
      memberId: claim.memberId,
      messId: payload.messId,
      email: claim.email,
      detail: { by: payload.sub },
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[POST /api/members/claims/%s]', id, err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
