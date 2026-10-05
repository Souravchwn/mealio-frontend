import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { calculateMealRate } from '@/lib/financial'

export async function GET(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  // Always the caller's own mess — never a mess id from the request
  const messId = payload.messId
  // No year_month → the current open period
  const yearMonth = searchParams.get('year_month') || null

  try {
    const mealRate = await calculateMealRate(messId, yearMonth)
    return NextResponse.json({ mess_id: messId, year_month: yearMonth, meal_rate: mealRate })
  } catch (err) {
    console.error('[GET /api/expenses/meal-rate] messId=%s', messId, err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
