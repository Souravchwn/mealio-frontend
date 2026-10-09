import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { getTodayHeadcount, type HeadcountSlot } from '@/lib/today'

const toJson = (s: HeadcountSlot) => ({
  member_count: s.memberCount,
  guest_count: s.guestCount,
  total: s.total,
  cutoff_time: s.cutoffTime,
  cutoff_passed: s.cutoffPassed,
  members: s.members.map((m) => ({ id: m.id, name: m.name, count: m.count, guest_count: m.guestCount, has_log: m.hasLog })),
  cook_note: s.cookNote,
})

export async function GET(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  // Always the caller's own mess — never a mess id from the request
  const headcount = await getTodayHeadcount(payload.messId)
  if (!headcount) return NextResponse.json({ detail: 'Mess not found' }, { status: 404 })

  const lunch = headcount.slots.lunch
  return NextResponse.json({
    mess_name: headcount.messName,
    date: headcount.date,
    // Backward-compat top-level fields (used by overview) — based on lunch slot
    member_count: lunch.memberCount,
    guest_count: lunch.guestCount,
    total_headcount: lunch.total,
    source: 'database',
    slots: {
      breakfast: toJson(headcount.slots.breakfast),
      lunch: toJson(headcount.slots.lunch),
      dinner: toJson(headcount.slots.dinner),
    },
  })
}
