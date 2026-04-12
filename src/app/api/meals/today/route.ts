import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { extractCutoffTime, isCutoffPassed } from '@/lib/financial'
import { DEFAULT_TIMEZONE } from '@/lib/constants'

export async function GET(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const memberId = searchParams.get('member_id') || payload.sub
  const logDate = searchParams.get('log_date') || new Date().toISOString().slice(0, 10)

  const mess = await prisma.mess.findUnique({
    where: { id: payload.messId },
    select: { cutOffTime: true },
  })

  const cutoffHHMM = extractCutoffTime(mess?.cutOffTime)
  const logDateObj = new Date(`${logDate}T00:00:00.000Z`)

  let log = await prisma.dailyLog.findFirst({
    where: { memberId, messId: payload.messId, logDate: logDateObj },
  })

  if (!log) {
    log = await prisma.dailyLog.create({
      data: {
        memberId,
        messId: payload.messId,
        logDate: logDateObj,
        breakfast: true,
        lunch: true,
        dinner: true,
        guestCount: 0,
        frozen: false,
      },
    })
  }

  if (!log) return NextResponse.json({ detail: 'Failed to get meal log' }, { status: 500 })

  const cutOffPassed = log.frozen || isCutoffPassed(cutoffHHMM, logDate, DEFAULT_TIMEZONE)

  return NextResponse.json({
    id: log.id,
    member_id: log.memberId,
    date: log.logDate.toISOString().slice(0, 10),
    breakfast: log.breakfast,
    lunch: log.lunch,
    dinner: log.dinner,
    guest_count: log.guestCount,
    frozen: log.frozen,
    cut_off_time: cutoffHHMM,
    cut_off_passed: cutOffPassed,
  })
}
