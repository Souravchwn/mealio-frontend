import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { calculateMealRate } from '@/lib/financial'

export async function GET(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const messId = searchParams.get('mess_id') || payload.messId
  const yearMonth = searchParams.get('year_month') || new Date().toISOString().slice(0, 7)

  const mealRate = await calculateMealRate(messId, yearMonth)

  return NextResponse.json({ mess_id: messId, year_month: yearMonth, meal_rate: mealRate })
}
