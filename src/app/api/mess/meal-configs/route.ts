/**
 * /api/mess/meal-configs
 *
 * GET — Returns meal configs for the current user's mess (served from Redis).
 * PUT — Admin/Manager: update a single meal config, then refresh the Redis copy.
 *       Body: { meal_type, cutoff_time?, enabled?, max_count? }
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { MEAL_TYPES, DEFAULT_MAX_MEAL_COUNT, DEFAULT_CUTOFF_TIME } from '@/lib/constants'
import { getMessSettings, refreshMessSettings } from '@/lib/mess-settings'
import { createAudit } from '@/lib/audit'
import { settleDailyLogs } from '@/lib/daily-logs'

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const MAX_ALLOWED_COUNT = 50

export async function GET(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  const settings = await getMessSettings(payload.messId)
  if (!settings) return NextResponse.json({ detail: 'Mess not found' }, { status: 404 })

  const configs = MEAL_TYPES
    .map((mealType) => ({
      id: mealType,
      meal_type: mealType,
      enabled: settings.meals[mealType].enabled,
      cutoff_time: settings.meals[mealType].cutoffTime,
      max_count: settings.meals[mealType].maxCount,
    }))
    .sort((a, b) => a.cutoff_time.localeCompare(b.cutoff_time))

  return NextResponse.json({ meal_configs: configs })
}

export async function PUT(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  if (payload.role !== 'ADMIN' && payload.role !== 'MANAGER') {
    return NextResponse.json({ detail: 'Admin or Manager access required' }, { status: 403 })
  }

  let body: { meal_type?: unknown; cutoff_time?: unknown; enabled?: unknown; max_count?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ detail: 'Invalid request body' }, { status: 400 })
  }
  const { meal_type, cutoff_time, enabled, max_count } = body

  const mealTypeUpper = typeof meal_type === 'string' ? meal_type.toUpperCase() : ''
  if (!MEAL_TYPES.includes(mealTypeUpper as typeof MEAL_TYPES[number])) {
    return NextResponse.json({ detail: 'Invalid meal_type' }, { status: 400 })
  }

  const updateData: Record<string, unknown> = {}
  if (enabled !== undefined) {
    if (typeof enabled !== 'boolean') return NextResponse.json({ detail: 'enabled must be true or false' }, { status: 400 })
    updateData.enabled = enabled
  }
  if (max_count !== undefined) {
    if (typeof max_count !== 'number' || !Number.isInteger(max_count) || max_count < 1 || max_count > MAX_ALLOWED_COUNT) {
      return NextResponse.json({ detail: `max_count must be a whole number between 1 and ${MAX_ALLOWED_COUNT}` }, { status: 400 })
    }
    updateData.maxCount = max_count
  }
  if (cutoff_time !== undefined) {
    if (typeof cutoff_time !== 'string' || !HHMM.test(cutoff_time)) {
      return NextResponse.json({ detail: 'cutoff_time must be HH:MM' }, { status: 400 })
    }
    updateData.cutoffTime = new Date(`1970-01-01T${cutoff_time}:00.000Z`)
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ detail: 'No valid fields to update' }, { status: 400 })
  }

  try {
    // Record every day so far under the current config — the change applies from now on
    await settleDailyLogs(payload.messId)
    await prisma.mealConfig.upsert({
      where: { messId_mealType: { messId: payload.messId, mealType: mealTypeUpper } },
      create: {
        messId: payload.messId,
        mealType: mealTypeUpper,
        enabled: typeof enabled === 'boolean' ? enabled : true,
        cutoffTime: (updateData.cutoffTime as Date) ?? new Date(`1970-01-01T${DEFAULT_CUTOFF_TIME}:00.000Z`),
        maxCount: (updateData.maxCount as number) ?? DEFAULT_MAX_MEAL_COUNT,
      },
      update: updateData,
    })
    await createAudit({
      messId: payload.messId,
      actorId: payload.sub,
      action: 'ADMIN_SETTINGS_UPDATE',
      targetTable: 'meal_configs',
      newValue: { meal_type: mealTypeUpper, ...body },
    })
  } catch (err) {
    console.error('[PUT /api/mess/meal-configs] messId=%s', payload.messId, err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }

  await refreshMessSettings(payload.messId)
  return NextResponse.json({ ok: true })
}
