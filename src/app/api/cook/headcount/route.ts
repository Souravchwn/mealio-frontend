import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { getMessSettings, todayIn, nowHHMMIn } from '@/lib/mess-settings'
import { ensureDailyLogs } from '@/lib/daily-logs'

const COUNT_FIELD = {
  BREAKFAST: 'breakfastCount',
  LUNCH: 'lunchCount',
  DINNER: 'dinnerCount',
} as const

export async function GET(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  // Always the caller's own mess — never a mess id from the request
  const messId = payload.messId
  const settings = await getMessSettings(messId)
  if (!settings) return NextResponse.json({ detail: 'Mess not found' }, { status: 404 })

  await ensureDailyLogs(messId)

  const today = todayIn(settings.timezone)
  const todayObj = new Date(`${today}T00:00:00.000Z`)
  const nowHHMM = nowHHMMIn(settings.timezone)

  const [members, logs, cookNotes] = await Promise.all([
    prisma.member.findMany({
      where: { messId, isActive: true },
      select: { id: true, name: true, isGuest: true },
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
    prisma.dailyCookNote
      .findMany({ where: { messId, logDate: todayObj }, select: { slot: true, note: true } })
      .catch(() => [] as { slot: string; note: string | null }[]),
  ])

  const logByMember = new Map(logs.map((l) => [l.memberId, l]))

  // Guest members (temporary residents) only appear when they have a log today
  const allMembers = members.filter((m) => !m.isGuest || logByMember.has(m.id))

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
      // No log = default ON (1 portion) for regular members; ensureDailyLogs normally creates it
      const count = log ? log[field] : 1
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

    const cutoffTime = settings.meals[slot].cutoffTime
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
    mess_name: settings.name,
    date: today,
    member_count,
    guest_count,
    total_headcount: total,
    source: 'database',
    slots,
  })
}
