import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'

export async function POST(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  const { member_id, date, guest_count } = await req.json()

  if ((guest_count as number) < 0) {
    return NextResponse.json({ detail: 'Guest count cannot be negative' }, { status: 400 })
  }

  const targetMemberId = member_id as string
  if (targetMemberId !== payload.sub && payload.role === 'MEMBER') {
    return NextResponse.json({ detail: "Cannot modify another member's log" }, { status: 403 })
  }

  const logDateObj = new Date(`${date as string}T00:00:00.000Z`)

  const log = await prisma.dailyLog.findFirst({
    where: { memberId: targetMemberId, messId: payload.messId, logDate: logDateObj },
    select: { id: true, frozen: true },
  })

  if (!log) {
    await prisma.dailyLog.create({
      data: {
        memberId: targetMemberId,
        messId: payload.messId,
        logDate: logDateObj,
        breakfast: true,
        lunch: true,
        dinner: true,
        guestCount: guest_count,
        frozen: false,
      },
    })
  } else {
    if (log.frozen) return NextResponse.json({ detail: 'This day is frozen' }, { status: 403 })
    await prisma.dailyLog.update({
      where: { id: log.id },
      data: { guestCount: guest_count, toggledAt: new Date() },
    })
  }

  return NextResponse.json({ ok: true })
}
