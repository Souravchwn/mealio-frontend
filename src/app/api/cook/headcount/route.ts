import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { DEFAULT_TIMEZONE, DEFAULT_MEAL_CONFIGS } from '@/lib/constants'

const COUNT_FIELD = {
  BREAKFAST: 'breakfastCount',
  LUNCH: 'lunchCount',
  DINNER: 'dinnerCount',
} as const

function toHHMM(ct: Date | string): string {
  if (ct instanceof Date) return ct.toISOString().slice(11, 16)
  return String(ct)
}

export async function GET(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const messId = searchParams.get('mess_id') || payload.messId

  const mess = await prisma.mess.findUnique({
    where: { id: messId },
    select: {
      name: true,
      telegramGroups: { where: { isActive: true }, select: { timezone: true }, take: 1 },
    },
  })
  const timezone = mess?.telegramGroups[0]?.timezone ?? DEFAULT_TIMEZONE

  // Today in mess timezone
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date())
  const todayObj = new Date(`${today}T00:00:00.000Z`)

  // Current time HH:MM in mess timezone (for cutoff comparison)
  const nowHHMM = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date())

  const [allMembers, logs, dbConfigs, cookNotes] = await Promise.all([
    prisma.member.findMany({
      where: { messId, isActive: true, isGuest: false },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.dailyLog.findMany({
      where: { messId, logDate: todayObj },
      select: {
        memberId: true,
        breakfastCount: true,
        lunchCount: true,
        dinnerCount: true,
        guestCount: true,
      },
    }),
    prisma.mealConfig
      .findMany({ where: { messId }, select: { mealType: true, cutoffTime: true } })
      .catch(() => [] as { mealType: string; cutoffTime: Date }[]),
    prisma.dailyCookNote
      .findMany({ where: { messId, logDate: todayObj }, select: { slot: true, note: true } })
      .catch(() => [] as { slot: string; note: string | null }[]),
  ])

  const logByMember = new Map(logs.map((l) => [l.memberId, l]))

  // Build cutoff lookup: mealType → HH:MM string
  const cutoffMap: Record<string, string> = {}
  for (const dc of DEFAULT_MEAL_CONFIGS) cutoffMap[dc.mealType] = dc.cutoffTime
  for (const c of dbConfigs) cutoffMap[c.mealType] = toHHMM(c.cutoffTime)

  // Build cook notes lookup: slot → note
  const noteBySlot = new Map(cookNotes.map((n) => [n.slot, n.note ?? null]))

  // Compute per-slot stats + per-member detail
  const slots = {} as Record<
    string,
    {
      member_count: number
      guest_count: number
      total: number
      cutoff_time: string
      cutoff_passed: boolean
      members: Array<{
        id: string
        name: string
        count: number
        guest_count: number
        has_log: boolean
      }>
      cook_note: string | null
    }
  >

  for (const slot of ['BREAKFAST', 'LUNCH', 'DINNER'] as const) {
    const field = COUNT_FIELD[slot]
    let memberPortions = 0
    let guestPortions = 0
    const memberDetail: Array<{ id: string; name: string; count: number; guest_count: number; has_log: boolean }> = []

    for (const m of allMembers) {
      const log = logByMember.get(m.id)
      const count = log ? log[field] : 1 // no log = default ON (1 portion)
      memberPortions += count
      // Guests only eat this meal if their host member is eating it.
      const guestCountForSlot = count > 0 && log ? log.guestCount : 0
      if (count > 0 && log) guestPortions += log.guestCount
      memberDetail.push({
        id: m.id,
        name: m.name,
        count,
        guest_count: guestCountForSlot,
        has_log: !!log,
      })
    }

    const cutoffTime = cutoffMap[slot] ?? '21:00'
    slots[slot.toLowerCase()] = {
      member_count: memberPortions,
      guest_count: guestPortions,
      total: memberPortions + guestPortions,
      cutoff_time: cutoffTime,
      cutoff_passed: nowHHMM >= cutoffTime,
      members: memberDetail,
      cook_note: noteBySlot.get(slot) ?? null,
    }
  }

  // Backward-compat top-level fields (used by overview) — based on lunch slot
  const { member_count, guest_count, total } = slots['lunch']

  return NextResponse.json({
    mess_name: mess?.name ?? '',
    date: today,
    member_count,
    guest_count,
    total_headcount: total,
    source: 'database',
    slots,
  })
}
