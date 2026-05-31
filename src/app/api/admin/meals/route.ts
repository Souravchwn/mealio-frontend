import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { getMemberMealDefaults } from '@/lib/meal-preferences'

const SLOT_COUNT_FIELD: Record<string, string> = {
  breakfast: 'breakfastCount',
  lunch:     'lunchCount',
  dinner:    'dinnerCount',
}

/**
 * PUT /api/admin/meals
 * Admin-only: set a meal slot count on a historical date for any member.
 *
 * Body: { member_id, date, slot: "breakfast"|"lunch"|"dinner", value: boolean | count: number }
 */
export async function PUT(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  if (payload.role !== 'ADMIN') {
    return NextResponse.json({ detail: 'Admin access required' }, { status: 403 })
  }

  const body = await req.json()
  const { member_id, date, slot } = body as { member_id?: string; date?: string; slot?: string }

  // Accept `value: boolean` (legacy) or `count: number` (new)
  let newCount: number
  if (typeof body.count === 'number') {
    newCount = Math.max(0, body.count)
  } else if (typeof body.value === 'boolean') {
    newCount = body.value ? 1 : 0
  } else {
    return NextResponse.json({ detail: 'count or value is required' }, { status: 400 })
  }

  if (!member_id || !date || !slot) {
    return NextResponse.json({ detail: 'member_id, date, and slot are required' }, { status: 400 })
  }

  const slotLower = slot.toLowerCase()
  if (!['breakfast', 'lunch', 'dinner'].includes(slotLower)) {
    return NextResponse.json({ detail: 'slot must be breakfast, lunch, or dinner' }, { status: 400 })
  }

  const member = await prisma.member.findFirst({
    where: { id: member_id, messId: payload.messId },
    select: { id: true, name: true, messId: true },
  })
  if (!member) {
    return NextResponse.json({ detail: 'Member not found' }, { status: 404 })
  }

  const logDate = new Date(`${date}T00:00:00.000Z`)
  const countField = SLOT_COUNT_FIELD[slotLower]

  // Get current log to record old value in audit
  const existingLog = await prisma.dailyLog.findFirst({
    where: { messId: member.messId!, memberId: member_id, logDate },
    select: { id: true, breakfastCount: true, lunchCount: true, dinnerCount: true },
  })
  const oldCount = existingLog
    ? (existingLog as unknown as Record<string, number>)[countField] ?? 1
    : 1

  let logId: string
  if (!existingLog) {
    const defaults = await getMemberMealDefaults(member_id, member.messId!, date)
    const created = await prisma.dailyLog.create({
      data: {
        messId: member.messId!,
        memberId: member_id,
        logDate,
        breakfastCount: defaults.breakfastCount,
        lunchCount: defaults.lunchCount,
        dinnerCount: defaults.dinnerCount,
        frozen: false,
        isOverride: true,
        overrideType: 'ADMIN',
        [countField]: newCount,
      },
    })
    logId = created.id
  } else {
    await prisma.dailyLog.update({
      where: { id: existingLog.id },
      data: { [countField]: newCount, isOverride: true, overrideType: 'ADMIN' },
    })
    logId = existingLog.id
  }

  await prisma.auditLog.create({
    data: {
      messId: member.messId,
      actorId: payload.sub,
      action: 'ADMIN_MEAL_OVERRIDE',
      targetTable: 'daily_logs',
      targetId: logId,
      oldValue: { [countField]: oldCount },
      newValue: { [countField]: newCount, date, member_id },
    },
  })

  return NextResponse.json({ ok: true, log_id: logId })
}
