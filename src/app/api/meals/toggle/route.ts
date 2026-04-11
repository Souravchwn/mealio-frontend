import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'

export async function POST(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  const { member_id, date, slot, status } = await req.json()

  const validSlots = ['BREAKFAST', 'LUNCH', 'DINNER']
  if (!validSlots.includes((slot as string)?.toUpperCase())) {
    return NextResponse.json({ detail: 'Invalid meal slot' }, { status: 400 })
  }

  const targetMemberId = member_id as string
  if (targetMemberId !== payload.sub && payload.role === 'MEMBER') {
    return NextResponse.json({ detail: "Cannot modify another member's meals" }, { status: 403 })
  }

  const mess = await prisma.mess.findUnique({
    where: { id: payload.messId },
    select: { cutOffTime: true },
  })

  const cutOffTime = mess?.cutOffTime
    ? mess.cutOffTime.toISOString().slice(11, 16)
    : '21:00'

  const today = new Date().toISOString().slice(0, 10)
  if ((date as string) === today) {
    const [h, m] = cutOffTime.split(':').map(Number)
    const cutoff = new Date()
    cutoff.setHours(h, m, 0, 0)
    if (Date.now() >= cutoff.getTime()) {
      return NextResponse.json({ detail: `Cut-off time (${cutOffTime}) has passed` }, { status: 403 })
    }
  }

  const logDateObj = new Date(`${date as string}T00:00:00.000Z`)

  let log = await prisma.dailyLog.findFirst({
    where: { memberId: targetMemberId, messId: payload.messId, logDate: logDateObj },
    select: { id: true, frozen: true },
  })

  if (!log) {
    log = await prisma.dailyLog.create({
      data: {
        memberId: targetMemberId,
        messId: payload.messId,
        logDate: logDateObj,
        breakfast: true,
        lunch: true,
        dinner: true,
        guestCount: 0,
        frozen: false,
      },
      select: { id: true, frozen: true },
    })
  }

  if (!log) return NextResponse.json({ detail: 'Failed to get meal log' }, { status: 500 })
  if (log.frozen) return NextResponse.json({ detail: 'This day is frozen' }, { status: 403 })

  const column = (slot as string).toLowerCase() as 'breakfast' | 'lunch' | 'dinner'
  await prisma.dailyLog.update({
    where: { id: log.id },
    data: { [column]: status, toggledAt: new Date() },
  })

  await prisma.auditLog.create({
    data: {
      messId: payload.messId,
      actorId: payload.sub,
      action: 'TOGGLE_MEAL',
      targetTable: 'daily_logs',
      targetId: log.id,
      newValue: { slot, status, date },
    },
  })

  return NextResponse.json({ ok: true })
}
