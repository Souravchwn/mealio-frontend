import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { closeMonth, MonthAlreadyClosedError, PeriodNotFinishedError } from '@/lib/financial'
import { isActiveMemberOfMess } from '@/lib/meal-access'

const YEAR_MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

// ⚠️  IRREVERSIBLE OPERATION — delegates to closeMonth() in financial.ts
export async function POST(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  if (payload.role !== 'ADMIN') {
    return NextResponse.json({ detail: 'Admin access required' }, { status: 403 })
  }

  let body: { year_month?: unknown; next_manager_id?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ detail: 'Invalid request body' }, { status: 400 })
  }
  // mess_id in the body is ignored — an admin can only close their own mess
  const messId = payload.messId
  const { year_month, next_manager_id } = body

  if (typeof year_month !== 'string' || !YEAR_MONTH_RE.test(year_month)) {
    return NextResponse.json({ detail: 'year_month must be YYYY-MM' }, { status: 400 })
  }
  if (next_manager_id) {
    if (typeof next_manager_id !== 'string' || !(await isActiveMemberOfMess(next_manager_id, messId))) {
      return NextResponse.json({ detail: 'Next manager must be an active member of this mess' }, { status: 400 })
    }
  }

  try {
    const result = await closeMonth(messId, year_month, payload.sub, (next_manager_id as string) || null)
    return NextResponse.json({
      ok: true,
      meal_rate: result.mealRate,
      total_expense: result.totalExpense,
      total_meals: result.totalMeals,
      next_period: result.nextPeriod,
    })
  } catch (err) {
    if (err instanceof MonthAlreadyClosedError) {
      return NextResponse.json({ detail: 'This month is already closed' }, { status: 409 })
    }
    if (err instanceof PeriodNotFinishedError) {
      return NextResponse.json(
        { detail: `This period runs until ${err.endDate}. It can be closed on or after that day.` },
        { status: 400 },
      )
    }
    console.error('[POST /api/admin/close-month] messId=%s month=%s', messId, year_month, err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
