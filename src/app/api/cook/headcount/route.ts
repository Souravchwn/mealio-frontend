import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { DEFAULT_TIMEZONE } from '@/lib/constants'

export async function GET(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const messId = searchParams.get('mess_id') || payload.messId

  // Resolve today in the mess's timezone
  const mess = await prisma.mess.findUnique({
    where: { id: messId },
    select: {
      name: true,
      telegramGroups: { where: { isActive: true }, select: { timezone: true }, take: 1 },
    },
  })
  const timezone = mess?.telegramGroups[0]?.timezone ?? DEFAULT_TIMEZONE
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date())
  const todayObj = new Date(`${today}T00:00:00.000Z`)

  const [allMembers, logs] = await Promise.all([
    prisma.member.findMany({
      where: { messId, isActive: true, isGuest: false },
      select: { id: true },
    }),
    prisma.dailyLog.findMany({
      where: { messId, logDate: todayObj },
      select: { memberId: true, lunchCount: true, guestCount: true },
    }),
  ])

  const logByMember = new Map(logs.map((l) => [l.memberId, l]))

  // A member counts if they have no log (default ON = 1) OR their log has lunchCount > 0
  const memberCount = allMembers.filter((m) => {
    const log = logByMember.get(m.id)
    return log ? log.lunchCount > 0 : true
  }).length

  // Sum up lunchCount for members with logs (> 0), plus default 1 for members without logs
  const totalMemberPortions = allMembers.reduce((sum, m) => {
    const log = logByMember.get(m.id)
    if (!log) return sum + 1 // default
    return sum + log.lunchCount
  }, 0)

  const guestCount = logs.reduce((s, l) => s + l.guestCount, 0)

  return NextResponse.json({
    mess_name: mess?.name ?? '',
    date: today,
    member_count: memberCount,
    guest_count: guestCount,
    total_headcount: totalMemberPortions + guestCount,
    source: 'database',
  })
}
