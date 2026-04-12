import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'

/**
 * PUT /api/admin/meals
 * Admin-only: toggle a single meal slot on a historical date for any member.
 *
 * Body: { member_id, date, slot: "breakfast"|"lunch"|"dinner", value: boolean }
 */
export async function PUT(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  if (payload.role !== 'ADMIN') {
    return NextResponse.json({ detail: 'Admin access required' }, { status: 403 })
  }

  const { member_id, date, slot, value } = await req.json()

  if (!member_id || !date || !slot || typeof value !== 'boolean') {
    return NextResponse.json({ detail: 'member_id, date, slot, and value are required' }, { status: 400 })
  }

  if (!['breakfast', 'lunch', 'dinner'].includes(slot)) {
    return NextResponse.json({ detail: 'slot must be breakfast, lunch, or dinner' }, { status: 400 })
  }

  // Verify member belongs to admin's mess
  const member = await prisma.member.findFirst({
    where: { id: member_id, messId: payload.messId },
    select: { id: true, name: true, messId: true },
  })
  if (!member) {
    return NextResponse.json({ detail: 'Member not found' }, { status: 404 })
  }

  const logDate = new Date(`${date}T00:00:00.000Z`)

  const log = await prisma.dailyLog.upsert({
    where: { messId_memberId_logDate: { messId: member.messId!, memberId: member_id, logDate } },
    create: {
      messId: member.messId!,
      memberId: member_id,
      logDate,
      breakfast: slot === 'breakfast' ? value : true,
      lunch: slot === 'lunch' ? value : true,
      dinner: slot === 'dinner' ? value : true,
      guestCount: 0,
      frozen: false,
    },
    update: { [slot]: value },
  })

  // Audit trail
  await prisma.auditLog.create({
    data: {
      messId: member.messId,
      actorId: payload.sub,
      action: 'ADMIN_MEAL_OVERRIDE',
      targetTable: 'daily_logs',
      targetId: log.id,
      oldValue: { [slot]: !value },
      newValue: { [slot]: value, date, member_id },
    },
  })

  return NextResponse.json({ ok: true, log_id: log.id })
}
