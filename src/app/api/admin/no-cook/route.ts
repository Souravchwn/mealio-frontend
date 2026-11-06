import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { getMemberMealDefaults } from '@/lib/meal-preferences'
import { getMessSettings, todayIn } from '@/lib/mess-settings'
import { isDateInClosedPeriod } from '@/lib/period'
import { DEFAULT_TIMEZONE } from '@/lib/constants'

/**
 * POST /api/admin/no-cook
 *
 * Body:
 *   { date?: "YYYY-MM-DD", action: "off" | "on", reason?: string }
 *
 * Turns all member meals ON or OFF for the given date and posts a broadcast about it.
 */
export async function POST(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  if (payload.role !== 'ADMIN' && payload.role !== 'MANAGER') {
    return NextResponse.json({ detail: 'Admin or Manager access required' }, { status: 403 })
  }

  const body = await req.json()
  const action: 'on' | 'off' = body.action === 'on' ? 'on' : 'off'
  const messId: string = payload.messId
  const settings = await getMessSettings(messId)
  const date: string = body.date ?? todayIn(settings?.timezone ?? DEFAULT_TIMEZONE)
  const reason: string = typeof body.reason === 'string' ? body.reason.slice(0, 200) : ''

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ detail: 'Invalid date format. Use YYYY-MM-DD.' }, { status: 400 })
  }

  const dateObj = new Date(`${date}T00:00:00.000Z`)
  if (await isDateInClosedPeriod(messId, dateObj)) {
    return NextResponse.json({ detail: 'That date is in a closed month and can no longer be changed' }, { status: 400 })
  }

  const members = await prisma.member.findMany({
    where: { messId, isActive: true },
    select: { id: true },
  })

  if (action === 'off') {
    // Set all meal counts to 0 (ADMIN override)
    await Promise.all(members.map(m =>
      prisma.dailyLog.upsert({
        where: { messId_memberId_logDate: { messId, memberId: m.id, logDate: dateObj } },
        create: {
          memberId: m.id,
          messId,
          logDate: dateObj,
          breakfastCount: 0,
          lunchCount: 0,
          dinnerCount: 0,
          guestCount: 0,
          frozen: false,
          isOverride: true,
          overrideType: 'ADMIN',
        },
        update: { breakfastCount: 0, lunchCount: 0, dinnerCount: 0, isOverride: true, overrideType: 'ADMIN' },
      }),
    ))
  } else {
    // Restore each member to their preference defaults
    await Promise.all(members.map(async (m) => {
      const defaults = await getMemberMealDefaults(m.id, messId, date)
      await prisma.dailyLog.upsert({
        where: { messId_memberId_logDate: { messId, memberId: m.id, logDate: dateObj } },
        create: {
          memberId: m.id,
          messId,
          logDate: dateObj,
          breakfastCount: defaults.breakfastCount,
          lunchCount: defaults.lunchCount,
          dinnerCount: defaults.dinnerCount,
          guestCount: 0,
          frozen: false,
          isOverride: false,
          overrideType: null,
        },
        update: {
          breakfastCount: defaults.breakfastCount,
          lunchCount: defaults.lunchCount,
          dinnerCount: defaults.dinnerCount,
          isOverride: false,
          overrideType: null,
        },
      })
    }))
  }

  await prisma.auditLog.create({
    data: { messId, actorId: payload.sub, action: 'NO_COOK', targetTable: 'daily_logs', newValue: { date, action, reason: reason || null, via: 'web' } },
  })

  // Tell the mess: a broadcast members see on their Overview page. A failure here must not
  // undo the meals change, so it is logged and swallowed.
  const notice = action === 'off'
    ? `No meals on ${date}. All meals are turned off for the day.${reason ? ` Reason: ${reason}` : ''}`
    : `Meals are back on for ${date}, set to everyone's usual defaults.`
  let announced = false
  try {
    const author = await prisma.member.findUnique({ where: { id: payload.sub }, select: { name: true } })
    await prisma.announcement.create({
      data: { messId, authorId: payload.sub, authorName: author?.name ?? 'Admin', message: notice },
    })
    announced = true
  } catch (err) {
    console.error('[POST /api/admin/no-cook] announcement failed messId=%s', messId, err)
  }

  return NextResponse.json({
    ok: true,
    date,
    action,
    members_updated: members.length,
    announced,
  })
}
