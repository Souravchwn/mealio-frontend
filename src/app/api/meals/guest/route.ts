/**
 * POST /api/meals/guest { member_id?, date?, slot, guest_count }
 *
 * Set how many guests a member brings to ONE meal (breakfast, lunch or dinner). A guest can
 * come for lunch only, dinner only, or both: each meal is set on its own, before that meal's
 * cutoff. Under the mess's guest_meal_policy (HOST by default) guest meals are charged to the
 * host; see calculatePeriodSummary() in lib/financial.ts and lib/guests.ts.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { getMemberMealDefaults } from '@/lib/meal-preferences'
import { getMessSettings, nowHHMMIn } from '@/lib/mess-settings'
import { checkMealWriteAccess } from '@/lib/meal-access'
import { MAX_GUEST_COUNT, type MealTypeUpper } from '@/lib/constants'
import { createAudit } from '@/lib/audit'
import { GUEST_SELECT, GUEST_SLOTS, guestsBySlot, setSlotGuestsData, type GuestSlot } from '@/lib/guests'

export async function POST(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  let body: { member_id?: unknown; date?: unknown; slot?: unknown; guest_count?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ detail: 'Invalid request body' }, { status: 400 })
  }
  const { member_id, date, guest_count } = body
  const slot = (typeof body.slot === 'string' ? body.slot.toLowerCase() : '') as GuestSlot

  if (!GUEST_SLOTS.includes(slot)) {
    return NextResponse.json({ detail: 'Choose the meal: breakfast, lunch or dinner' }, { status: 400 })
  }
  if (typeof guest_count !== 'number' || !Number.isInteger(guest_count) || guest_count < 0 || guest_count > MAX_GUEST_COUNT) {
    return NextResponse.json({ detail: `Guest count must be a whole number between 0 and ${MAX_GUEST_COUNT}` }, { status: 400 })
  }

  const settings = await getMessSettings(payload.messId)
  if (!settings) return NextResponse.json({ detail: 'Mess not found' }, { status: 404 })

  const access = await checkMealWriteAccess(payload, settings, member_id, date)
  if (!access.ok) return NextResponse.json({ detail: access.detail }, { status: access.status })
  const { targetMemberId, date: logDate, isToday } = access

  const meal = settings.meals[slot.toUpperCase() as MealTypeUpper]
  if (!meal.enabled) return NextResponse.json({ detail: 'The mess does not serve this meal' }, { status: 400 })
  // Each meal's guests can change until that meal's cutoff, the same rule as the meal itself
  // (after it, the cook is already cooking; an admin corrects the day in the matrix)
  if (isToday && nowHHMMIn(settings.timezone) >= meal.cutoffTime) {
    return NextResponse.json({ detail: `Cut-off time (${meal.cutoffTime}) has passed for this meal` }, { status: 403 })
  }

  const logDateObj = new Date(`${logDate}T00:00:00.000Z`)

  try {
    const log = await prisma.dailyLog.findFirst({
      where: { memberId: targetMemberId, messId: payload.messId, logDate: logDateObj },
      select: { id: true, frozen: true, breakfastCount: true, lunchCount: true, dinnerCount: true, ...GUEST_SELECT },
    })

    let logId: string
    let before = { breakfast: 0, lunch: 0, dinner: 0 }
    let after: ReturnType<typeof guestsBySlot>
    if (!log) {
      const defaults = await getMemberMealDefaults(targetMemberId, payload.messId, logDate)
      const base = { ...defaults, guestCount: 0, guestBreakfast: 0, guestLunch: 0, guestDinner: 0 }
      const data = setSlotGuestsData(base, slot, guest_count)
      const created = await prisma.dailyLog.create({
        data: {
          memberId: targetMemberId,
          messId: payload.messId,
          logDate: logDateObj,
          breakfastCount: defaults.breakfastCount,
          lunchCount: defaults.lunchCount,
          dinnerCount: defaults.dinnerCount,
          ...data,
          frozen: false,
        },
        select: { id: true },
      })
      logId = created.id
      after = { breakfast: data.guestBreakfast, lunch: data.guestLunch, dinner: data.guestDinner }
    } else {
      if (log.frozen) return NextResponse.json({ detail: 'This day is frozen' }, { status: 403 })
      before = guestsBySlot(log)
      const data = setSlotGuestsData(log, slot, guest_count)
      await prisma.dailyLog.update({ where: { id: log.id }, data: { ...data, toggledAt: new Date() } })
      logId = log.id
      after = { breakfast: data.guestBreakfast, lunch: data.guestLunch, dinner: data.guestDinner }
    }

    await createAudit({
      messId: payload.messId,
      actorId: payload.sub,
      action: 'TOGGLE_MEAL',
      targetTable: 'daily_logs',
      targetId: logId,
      oldValue: { guests: before },
      newValue: { guests: after, slot, date: logDate, member_id: targetMemberId },
    })

    return NextResponse.json({ ok: true, slot, guest_count, guests: after, guest_meal_policy: settings.guestMealPolicy })
  } catch (err) {
    console.error('[POST /api/meals/guest] member=%s date=%s', targetMemberId, logDate, err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
