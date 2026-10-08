/**
 * GET /api/mess/period
 * The mess's current open billing period and whether it is overdue (today is past its end),
 * so the app can show where the books stand and tell the admin to close it.
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { resolvePeriod } from '@/lib/period'
import { requireMessSettings, todayIn } from '@/lib/mess-settings'

const DAY_MS = 24 * 60 * 60 * 1000

export async function GET(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  try {
    const [period, settings] = await Promise.all([resolvePeriod(payload.messId), requireMessSettings(payload.messId)])
    const today = todayIn(settings.timezone)
    const end = period.end.toISOString().slice(0, 10)
    const daysLeft = Math.round((period.end.getTime() - new Date(`${today}T00:00:00.000Z`).getTime()) / DAY_MS)
    return NextResponse.json({
      year_month: period.yearMonth,
      start_date: period.start.toISOString().slice(0, 10),
      end_date: end,
      is_closed: period.isClosed,
      today,
      days_left: daysLeft,
      overdue: today > end,
    })
  } catch (err) {
    console.error('[GET /api/mess/period]', err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
