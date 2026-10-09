/**
 * /api/members/meal-preferences — the signed-in member's own default meals.
 *
 * GET  — 3 meals × 2 day types = 6 rows. Meals without an own row follow the mess default.
 * PUT  — change one default, never retroactive (see src/lib/member-preferences.ts).
 *        Body: { meal_type, day_type, enabled, default_count? }
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { getMessSettings } from '@/lib/mess-settings'
import { readMemberPreferences, updateMemberPreference } from '@/lib/member-preferences'

export async function GET(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  try {
    const settings = await getMessSettings(payload.messId)
    if (!settings) return NextResponse.json({ detail: 'Mess not found' }, { status: 404 })
    return NextResponse.json({ preferences: await readMemberPreferences(payload.sub, payload.messId, settings) })
  } catch (err) {
    console.error('[GET /api/members/meal-preferences] member=%s', payload.sub, err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ detail: 'Invalid request body' }, { status: 400 })
  }

  try {
    const settings = await getMessSettings(payload.messId)
    if (!settings) return NextResponse.json({ detail: 'Mess not found' }, { status: 404 })
    const result = await updateMemberPreference({ memberId: payload.sub, messId: payload.messId, actorId: payload.sub, settings, body })
    if (!result.ok) return NextResponse.json({ detail: result.detail }, { status: result.status })
    return NextResponse.json({ ok: true, applied_today: result.appliedToday })
  } catch (err) {
    console.error('[PUT /api/members/meal-preferences] member=%s', payload.sub, err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
