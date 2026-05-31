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
      where: { messId, isActive: true },
      select: { id: true },
    }),
    prisma.dailyLog.findMany({
      where: { messId, logDate: todayObj },
      select: {
        memberId: true,
        breakfastCount: true, lunchCount: true, dinnerCount: true,
        guestBreakfastCount: true, guestLunchCount: true, guestDinnerCount: true,
      },
    }),
  ])

  const logByMember = new Map(logs.map((l) => [l.memberId, l]))

  type Slot = 'breakfast' | 'lunch' | 'dinner'
  const SLOT_COUNT: Record<Slot, 'breakfastCount' | 'lunchCount' | 'dinnerCount'> = {
    breakfast: 'breakfastCount',
    lunch:     'lunchCount',
    dinner:    'dinnerCount',
  }
  const SLOT_GUEST: Record<Slot, 'guestBreakfastCount' | 'guestLunchCount' | 'guestDinnerCount'> = {
    breakfast: 'guestBreakfastCount',
    lunch:     'guestLunchCount',
    dinner:    'guestDinnerCount',
  }

  function breakdown(slot: Slot) {
    const countField = SLOT_COUNT[slot]
    const guestField = SLOT_GUEST[slot]

    // Member portions: members with a log use their count; members without a
    // log default to 1 (meal ON by default).
    let memberPortions = 0
    let memberCount = 0
    for (const m of allMembers) {
      const log = logByMember.get(m.id)
      const count = log ? log[countField] : 1
      if (count > 0) memberCount += 1
      memberPortions += count
    }

    const guestCount = logs.reduce((s, l) => s + l[guestField], 0)

    return {
      member_count: memberCount,
      guest_count: guestCount,
      total: memberPortions + guestCount,
    }
  }

  return NextResponse.json({
    mess_name: mess?.name ?? '',
    date: today,
    meals: {
      breakfast: breakdown('breakfast'),
      lunch: breakdown('lunch'),
      dinner: breakdown('dinner'),
    },
    source: 'database',
  })
}
