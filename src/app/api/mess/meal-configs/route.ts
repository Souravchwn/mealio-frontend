/**
 * /api/mess/meal-configs
 *
 * GET — Returns meal configs for the current user's mess.
 *       Falls back to defaults if the table doesn't exist yet.
 * PUT — Admin/Manager: update a single meal config.
 *       Body: { meal_type, cutoff_time?, enabled?, max_count? }
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { MEAL_TYPES, DEFAULT_MEAL_CONFIGS } from '@/lib/constants'

const FALLBACK_CONFIGS = DEFAULT_MEAL_CONFIGS.map((cfg, i) => ({
  id: `default-${i}`,
  meal_type: cfg.mealType,
  enabled: true,
  cutoff_time: cfg.cutoffTime,
  max_count: 10,
}))

export async function GET(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  try {
    const rows = await prisma.mealConfig.findMany({
      where: { messId: payload.messId },
      select: { id: true, mealType: true, enabled: true, cutoffTime: true, maxCount: true },
      orderBy: { cutoffTime: 'asc' },
    })

    const configs = rows.length > 0
      ? rows.map((r) => ({
        id: r.id,
        meal_type: r.mealType,
        enabled: r.enabled,
        cutoff_time: r.cutoffTime.toISOString().slice(11, 16),
        max_count: r.maxCount,
      }))
      : FALLBACK_CONFIGS

    return NextResponse.json({ meal_configs: configs })
  } catch {
    // meal_configs table not yet migrated — return defaults
    return NextResponse.json({ meal_configs: FALLBACK_CONFIGS })
  }
}

export async function PUT(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  if (payload.role !== 'ADMIN' && payload.role !== 'MANAGER') {
    return NextResponse.json({ detail: 'Admin or Manager access required' }, { status: 403 })
  }

  const body = await req.json()
  const { meal_type, cutoff_time, enabled, max_count } = body as {
    meal_type?: string
    cutoff_time?: string
    enabled?: boolean
    max_count?: number
  }

  const mealTypeUpper = (meal_type as string)?.toUpperCase()
  if (!MEAL_TYPES.includes(mealTypeUpper as typeof MEAL_TYPES[number])) {
    return NextResponse.json({ detail: 'Invalid meal_type' }, { status: 400 })
  }

  const updateData: Record<string, unknown> = {}
  if (typeof enabled === 'boolean') updateData.enabled = enabled
  if (typeof max_count === 'number' && max_count > 0) updateData.maxCount = max_count
  if (typeof cutoff_time === 'string' && /^\d{2}:\d{2}$/.test(cutoff_time)) {
    updateData.cutoffTime = new Date(`1970-01-01T${cutoff_time}:00.000Z`)
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ detail: 'No valid fields to update' }, { status: 400 })
  }

  try {
    await prisma.mealConfig.upsert({
      where: { messId_mealType: { messId: payload.messId, mealType: mealTypeUpper } },
      create: {
        messId: payload.messId,
        mealType: mealTypeUpper,
        enabled: typeof enabled === 'boolean' ? enabled : true,
        cutoffTime: (updateData.cutoffTime as Date) ?? new Date('1970-01-01T21:00:00.000Z'),
        maxCount: typeof max_count === 'number' ? max_count : 10,
      },
      update: updateData,
    })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json(
      { detail: 'meal_configs table not yet available — run MIGRATION.sql first' },
      { status: 503 },
    )
  }
}
