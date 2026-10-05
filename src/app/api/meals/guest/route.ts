/**
 * POST /api/meals/guest — set how many guests a member brings on a day.
 *
 * Guests eat every meal their host eats that day. Under the mess's
 * guest_meal_policy (HOST by default) those guest meals are charged to the
 * host only — see calculatePeriodSummary() in lib/financial.ts.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { getMemberMealDefaults } from '@/lib/meal-preferences'
import { getMessSettings, nowHHMMIn } from '@/lib/mess-settings'
import { checkMealWriteAccess, isPrivileged } from '@/lib/meal-access'
import { MAX_GUEST_COUNT, MEAL_TYPES } from '@/lib/constants'
import { createAudit } from '@/lib/audit'

export async function POST(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  let body: { member_id?: unknown; date?: unknown; guest_count?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ detail: 'Invalid request body' }, { status: 400 })
  }
  const { member_id, date, guest_count } = body

  if (typeof guest_count !== 'number' || !Number.isInteger(guest_count) || guest_count < 0 || guest_count > MAX_GUEST_COUNT) {
    return NextResponse.json({ detail: `Guest count must be a whole number between 0 and ${MAX_GUEST_COUNT}` }, { status: 400 })
  }

  const settings = await getMessSettings(payload.messId)
  if (!settings) return NextResponse.json({ detail: 'Mess not found' }, { status: 404 })

  const access = await checkMealWriteAccess(payload, settings, member_id, date)
  if (!access.ok) return NextResponse.json({ detail: access.detail }, { status: access.status })
  const { targetMemberId, date: logDate, isToday } = access

  // Guests can be changed today until the last meal's cutoff has passed
  if (isToday && !isPrivileged(payload.role)) {
    const lastCutoff = MEAL_TYPES
      .filter((t) => settings.meals[t].enabled)
      .map((t) => settings.meals[t].cutoffTime)
      .sort()
      .pop()
    if (lastCutoff && nowHHMMIn(settings.timezone) >= lastCutoff) {
      return NextResponse.json({ detail: `Cut-off time (${lastCutoff}) has passed for today` }, { status: 403 })
    }
  }

  const logDateObj = new Date(`${logDate}T00:00:00.000Z`)

  try {
    const log = await prisma.dailyLog.findFirst({
      where: { memberId: targetMemberId, messId: payload.messId, logDate: logDateObj },
      select: { id: true, frozen: true, guestCount: true },
    })

    let logId: string
    if (!log) {
      const defaults = await getMemberMealDefaults(targetMemberId, payload.messId, logDate)
      const created = await prisma.dailyLog.create({
        data: {
          memberId: targetMemberId,
          messId: payload.messId,
          logDate: logDateObj,
          breakfastCount: defaults.breakfastCount,
          lunchCount: defaults.lunchCount,
          dinnerCount: defaults.dinnerCount,
          guestCount: guest_count,
          frozen: false,
        },
        select: { id: true },
      })
      logId = created.id
    } else {
      if (log.frozen) return NextResponse.json({ detail: 'This day is frozen' }, { status: 403 })
      await prisma.dailyLog.update({
        where: { id: log.id },
        data: { guestCount: guest_count, toggledAt: new Date() },
      })
      logId = log.id
    }

    await createAudit({
      messId: payload.messId,
      actorId: payload.sub,
      action: 'TOGGLE_MEAL',
      targetTable: 'daily_logs',
      targetId: logId,
      oldValue: { guest_count: log?.guestCount ?? 0 },
      newValue: { guest_count, date: logDate, member_id: targetMemberId },
    })

    return NextResponse.json({ ok: true, guest_count, guest_meal_policy: settings.guestMealPolicy })
  } catch (err) {
    console.error('[POST /api/meals/guest] member=%s date=%s', targetMemberId, logDate, err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
