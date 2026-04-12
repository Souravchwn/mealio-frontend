import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'

export async function GET(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const messId = searchParams.get('mess_id') || payload.messId
  const today = new Date().toISOString().slice(0, 10)
  const todayObj = new Date(`${today}T00:00:00.000Z`)

  const [mess, allMembers, logs] = await Promise.all([
    prisma.mess.findUnique({ where: { id: messId }, select: { name: true } }),
    // All active non-guest members
    prisma.member.findMany({
      where: { messId, isActive: true, isGuest: false },
      select: { id: true },
    }),
    prisma.dailyLog.findMany({
      where: { messId, logDate: todayObj },
      select: { memberId: true, lunch: true, guestCount: true },
    }),
  ])

  const logByMember = new Map(logs.map((l) => [l.memberId, l]))

  // A member is counted if they have no log (default ON) OR their log has lunch = true
  const memberCount = allMembers.filter((m) => {
    const log = logByMember.get(m.id)
    return log ? log.lunch : true
  }).length

  // Guest count only from explicit log entries
  const guestCount = logs.reduce((s, l) => s + l.guestCount, 0)

  return NextResponse.json({
    mess_name: mess?.name ?? '',
    date: today,
    member_count: memberCount,
    guest_count: guestCount,
    total_headcount: memberCount + guestCount,
    source: 'database',
  })
}
