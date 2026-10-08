/**
 * POST /api/members/[id]/join { decision: 'approve' | 'reject' } (ADMIN only)
 * Approving starts the member's meal count from today.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { createAudit } from '@/lib/audit'
import { invalidateDailyLogsMarker, settleDailyLogs } from '@/lib/daily-logs'
import { getPlan } from '@/lib/plans'
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
    const member = await prisma.member.findFirst({
      where: { id, messId: payload.messId, joinStatus: 'PENDING' },
      select: { id: true, name: true },
    })
    if (!member) return NextResponse.json({ detail: 'This request was already handled.' }, { status: 404 })

    if (body.decision === 'approve') {
      const mess = await prisma.mess.findUnique({ where: { id: payload.messId }, select: { plan: true } })
      const active = await prisma.member.count({ where: { messId: payload.messId, isActive: true } })
      if (active >= getPlan(mess?.plan).maxMembers) {
        return NextResponse.json({ detail: 'The mess is full on its current plan.', code: 'MESS_FULL' }, { status: 400 })
      }
      await settleDailyLogs(payload.messId)
      await prisma.member.update({
        where: { id },
        // Meals count from the day they are approved, not the day they asked
        data: { joinStatus: 'APPROVED', isActive: true, joinedAt: new Date() },
      })
      await invalidateDailyLogsMarker(payload.messId)
    } else {
      await prisma.member.update({ where: { id }, data: { joinStatus: 'REJECTED', isActive: false } })
    }

    await createAudit({
      messId: payload.messId,
      actorId: payload.sub,
      action: 'ADMIN_MEMBER_UPDATE',
      targetTable: 'members',
      targetId: id,
      newValue: { join: body.decision, name: member.name },
    })
    await logSecurityEvent({
      type: body.decision === 'approve' ? 'JOIN_APPROVED' : 'JOIN_REJECTED',
      memberId: id,
      messId: payload.messId,
      detail: { by: payload.sub },
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[POST /api/members/%s/join]', id, err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
