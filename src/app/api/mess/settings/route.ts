import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { createAuditTx } from '@/lib/audit'
import { getMessSettings, refreshMessSettings, type MessSettings } from '@/lib/mess-settings'
import { GUEST_MEAL_POLICIES, type GuestMealPolicy } from '@/lib/constants'
import { settleDailyLogs } from '@/lib/daily-logs'

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

function toResponse(s: MessSettings) {
  return {
    name: s.name,
    cut_off_time: s.cutOffTime,
    estimated_monthly_budget: s.estimatedMonthlyBudget,
    month_start_day: s.monthStartDay,
    timezone: s.timezone,
    guest_meal_policy: s.guestMealPolicy,
    bazaar_counts_as_deposit: s.bazaarCountsAsDeposit,
    carry_forward_balance: s.carryForwardBalance,
    weekend_days: s.weekendDays,
    require_join_approval: s.requireJoinApproval,
    plan: s.plan,
  }
}

// GET /api/mess/settings — served from Redis (Postgres on cache miss)
export async function GET(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  const settings = await getMessSettings(payload.messId)
  if (!settings) return NextResponse.json({ detail: 'Mess not found' }, { status: 404 })

  return NextResponse.json(toResponse(settings))
}

// PUT /api/mess/settings — Admin only. Writes Postgres, then refreshes Redis.
export async function PUT(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  if (payload.role !== 'ADMIN') {
    return NextResponse.json({ detail: 'Admin access required' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ detail: 'Invalid request body' }, { status: 400 })
  }
  const {
    name, cut_off_time, estimated_monthly_budget, month_start_day,
    guest_meal_policy, bazaar_counts_as_deposit, carry_forward_balance, weekend_days, require_join_approval,
  } = body
  const updateData: Record<string, unknown> = {}

  if (name !== undefined) {
    const trimmed = typeof name === 'string' ? name.trim() : ''
    if (!trimmed) return NextResponse.json({ detail: 'Name cannot be empty' }, { status: 400 })
    updateData.name = trimmed
  }

  if (cut_off_time !== undefined) {
    if (typeof cut_off_time !== 'string' || !HHMM.test(cut_off_time)) {
      return NextResponse.json({ detail: 'cut_off_time must be HH:MM' }, { status: 400 })
    }
    updateData.cutOffTime = new Date(`1970-01-01T${cut_off_time}:00.000Z`)
  }

  if (estimated_monthly_budget !== undefined) {
    if (estimated_monthly_budget === null || estimated_monthly_budget === '') {
      updateData.estimatedMonthlyBudget = null
    } else {
      const budget = Number(estimated_monthly_budget)
      if (isNaN(budget) || budget < 0) {
        return NextResponse.json({ detail: 'Budget must be a positive number' }, { status: 400 })
      }
      updateData.estimatedMonthlyBudget = budget
    }
  }

  if (month_start_day !== undefined) {
    const day = Number(month_start_day)
    if (isNaN(day) || day < 1 || day > 28 || !Number.isInteger(day)) {
      return NextResponse.json({ detail: 'month_start_day must be an integer between 1 and 28' }, { status: 400 })
    }
    updateData.monthStartDay = day
  }

  if (guest_meal_policy !== undefined) {
    if (!GUEST_MEAL_POLICIES.includes(guest_meal_policy as GuestMealPolicy)) {
      return NextResponse.json(
        { detail: `guest_meal_policy must be one of: ${GUEST_MEAL_POLICIES.join(', ')}` },
        { status: 400 },
      )
    }
    updateData.guestMealPolicy = guest_meal_policy
  }

  if (bazaar_counts_as_deposit !== undefined) {
    if (typeof bazaar_counts_as_deposit !== 'boolean') {
      return NextResponse.json({ detail: 'bazaar_counts_as_deposit must be true or false' }, { status: 400 })
    }
    updateData.bazaarCountsAsDeposit = bazaar_counts_as_deposit
  }

  if (carry_forward_balance !== undefined) {
    if (typeof carry_forward_balance !== 'boolean') {
      return NextResponse.json({ detail: 'carry_forward_balance must be true or false' }, { status: 400 })
    }
    updateData.carryForwardBalance = carry_forward_balance
  }

  if (require_join_approval !== undefined) {
    if (typeof require_join_approval !== 'boolean') {
      return NextResponse.json({ detail: 'require_join_approval must be true or false' }, { status: 400 })
    }
    updateData.requireJoinApproval = require_join_approval
  }

  if (weekend_days !== undefined) {
    if (
      !Array.isArray(weekend_days) || weekend_days.length > 6 ||
      !weekend_days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    ) {
      return NextResponse.json({ detail: 'weekend_days must be a list of weekday numbers from 0 to 6, leaving at least one weekday' }, { status: 400 })
    }
    updateData.weekendDays = Array.from(new Set(weekend_days as number[])).sort().join(',')
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ detail: 'No fields to update' }, { status: 400 })
  }

  try {
    // A new weekend definition must not rewrite days that already happened
    if (updateData.weekendDays !== undefined) await settleDailyLogs(payload.messId)
    await prisma.$transaction((tx) =>
      Promise.all([
        tx.mess.update({ where: { id: payload.messId }, data: updateData, select: { id: true } }),
        createAuditTx(tx, {
          messId: payload.messId,
          actorId: payload.sub,
          action: 'ADMIN_SETTINGS_UPDATE',
          targetTable: 'messes',
          targetId: payload.messId,
          newValue: updateData as object,
        }),
      ]),
    )
  } catch (err) {
    console.error('[PUT /api/mess/settings] messId=%s', payload.messId, err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }

  const settings = await refreshMessSettings(payload.messId)
  if (!settings) return NextResponse.json({ detail: 'Mess not found' }, { status: 404 })

  return NextResponse.json({ ok: true, ...toResponse(settings) })
}
