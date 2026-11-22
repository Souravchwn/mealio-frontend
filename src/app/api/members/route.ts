import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { calculatePeriodSummary } from '@/lib/financial'
import { resolvePeriod } from '@/lib/period'
import { getMessSettings, nowHHMMIn, todayIn } from '@/lib/mess-settings'
import { getMemberMealDefaults } from '@/lib/meal-preferences'
import { createAudit } from '@/lib/audit'
import { checkRateLimit } from '@/lib/rate-limit'
import { getPlan } from '@/lib/plans'
import { invalidateDailyLogsMarker, settleDailyLogs } from '@/lib/daily-logs'

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
        select: {
          id: true, name: true, phone: true, role: true, isActive: true, telegramLinked: true, isGuest: true,
          guestFrom: true, guestUntil: true, passwordHash: true,
        },
        orderBy: { joinedAt: 'asc' },
      }),
      calculatePeriodSummary(messId, period),
    ])

    // Live invites of members who have not joined yet (for the "Not joined yet" badge)
    const nameOnlyIds = members.filter((m) => !m.passwordHash).map((m) => m.id)
    const invites = nameOnlyIds.length
      ? await prisma.authToken.findMany({
          where: { memberId: { in: nameOnlyIds }, purpose: 'INVITE', usedAt: null, expiresAt: { gt: new Date() } },
          select: { memberId: true, createdAt: true },
        })
      : []
    const invitedAt = new Map(invites.map((i) => [i.memberId, i.createdAt.toISOString()]))

    return NextResponse.json({
      mess_name: settings?.name ?? '',
      members: members.map((member) => {
        const s = summary.forMember(member.id)
        return {
          id: member.id,
          name: member.name,
          phone: member.phone,
          role: member.role,
          has_account: !!member.passwordHash,
          invited_at: invitedAt.get(member.id) ?? null,
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

/**
 * POST /api/members { name } (ADMIN): add a member by name only, the way a sheet works.
 * They count from today with the mess default meals; they can join later through an invite.
 */
export async function POST(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'ADMIN') return NextResponse.json({ detail: 'Admin access required' }, { status: 403 })

  let body: { name?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ detail: 'Invalid request body' }, { status: 400 })
  }
  const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : ''
  if (name.length < 2 || name.length > 60) {
    return NextResponse.json({ detail: 'Enter a name between 2 and 60 characters' }, { status: 400 })
  }

  const rate = await checkRateLimit('add-member', payload.sub, 60, 60 * 60 * 1000)
  if (!rate.allowed) return NextResponse.json({ detail: 'Too many new members at once. Try again later.' }, { status: 429 })

  const messId = payload.messId
  try {
    const [mess, active, sameName] = await Promise.all([
      prisma.mess.findUnique({ where: { id: messId }, select: { plan: true } }),
      prisma.member.count({ where: { messId, isActive: true } }),
      prisma.member.findFirst({
        where: { messId, deletedAt: null, isActive: true, name: { equals: name, mode: 'insensitive' } },
        select: { id: true },
      }),
    ])
    if (active >= getPlan(mess?.plan).maxMembers) {
      return NextResponse.json({ detail: 'The mess is full on its current plan.', code: 'MESS_FULL' }, { status: 400 })
    }
    if (sameName) {
      return NextResponse.json({ detail: 'Someone in the mess already has this name. Add a surname or a nickname.', code: 'NAME_TAKEN' }, { status: 400 })
    }

    // Days so far keep their counts; the new member counts from today
    await settleDailyLogs(messId)
    const member = await prisma.member.create({
      data: { messId, name, role: 'MEMBER', invitedBy: payload.sub },
      select: { id: true, name: true },
    })
    // Today: only meals that are still open. Someone added at 9 pm did not eat breakfast or lunch.
    const settings = await getMessSettings(messId)
    if (settings) {
      const today = todayIn(settings.timezone)
      const now = nowHHMMIn(settings.timezone)
      const d = await getMemberMealDefaults(member.id, messId, today)
      const open = (meal: 'BREAKFAST' | 'LUNCH' | 'DINNER', count: number) => (now >= settings.meals[meal].cutoffTime ? 0 : count)
      const logDate = new Date(`${today}T00:00:00.000Z`)
      await prisma.dailyLog.upsert({
        where: { messId_memberId_logDate: { messId, memberId: member.id, logDate } },
        create: {
          messId, memberId: member.id, logDate,
          breakfastCount: open('BREAKFAST', d.breakfastCount),
          lunchCount: open('LUNCH', d.lunchCount),
          dinnerCount: open('DINNER', d.dinnerCount),
        },
        update: {},
      })
    }
    await invalidateDailyLogsMarker(messId)
    await createAudit({
      messId,
      actorId: payload.sub,
      action: 'ADMIN_MEMBER_ADD',
      targetTable: 'members',
      targetId: member.id,
      newValue: { name: member.name },
    })
    return NextResponse.json({ id: member.id, name: member.name, has_account: false })
  } catch (err) {
    console.error('[POST /api/members] messId=%s', messId, err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
