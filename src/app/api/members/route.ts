import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { calculatePeriodSummary } from '@/lib/financial'
import { resolvePeriod } from '@/lib/period'
import { getMessSettings } from '@/lib/mess-settings'

export async function GET(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  if (payload.role !== 'ADMIN' && payload.role !== 'MANAGER') {
    return NextResponse.json({ detail: 'Admin or Manager access required' }, { status: 403 })
  }

  // Always the caller's own mess — never a mess id from the request
  const messId = payload.messId
  const { searchParams } = new URL(req.url)
  const yearMonth = searchParams.get('year_month') || null
  // Admins can also list inactive members (to reactivate them)
  const includeInactive = payload.role === 'ADMIN' && searchParams.get('include_inactive') === '1'

  try {
    const period = await resolvePeriod(messId, yearMonth)
    const [settings, members, summary] = await Promise.all([
      getMessSettings(messId),
      prisma.member.findMany({
        where: includeInactive ? { messId, joinStatus: 'APPROVED', deletedAt: null } : { messId, isActive: true },
        select: { id: true, name: true, phone: true, role: true, isActive: true, telegramLinked: true, isGuest: true, guestFrom: true, guestUntil: true },
        orderBy: { joinedAt: 'asc' },
      }),
      calculatePeriodSummary(messId, period),
    ])

    return NextResponse.json({
      mess_name: settings?.name ?? '',
      members: members.map((member) => {
        const s = summary.forMember(member.id)
        return {
          id: member.id,
          name: member.name,
          phone: member.phone,
          role: member.role,
          meal_count: s.billableMeals,
          guest_meals: s.guestMeals,
          contributed: s.contributed,
          balance: s.balance,
          is_active: member.isActive,
          telegram_linked: member.telegramLinked,
          is_guest: member.isGuest,
          guest_from: member.guestFrom?.toISOString().slice(0, 10) ?? null,
          guest_until: member.guestUntil?.toISOString().slice(0, 10) ?? null,
        }
      }),
    })
  } catch (err) {
    console.error('[GET /api/members] messId=%s', messId, err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
