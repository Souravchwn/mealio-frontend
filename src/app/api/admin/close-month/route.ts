import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { closeMonth } from '@/lib/financial'

// ⚠️  IRREVERSIBLE OPERATION — delegates to closeMonth() in financial.ts
export async function POST(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  if (payload.role !== 'ADMIN') {
    return NextResponse.json({ detail: 'Admin access required' }, { status: 403 })
  }

  const { mess_id, year_month } = await req.json()

  if (!mess_id || !year_month) {
    return NextResponse.json({ detail: 'mess_id and year_month are required' }, { status: 400 })
  }

  try {
    const { mealRate, totalExpense } = await closeMonth(mess_id, year_month, payload.sub)
    return NextResponse.json({ ok: true, meal_rate: mealRate, total_expense: totalExpense })
  } catch (err) {
    if (err instanceof Error && err.message === 'Month is already closed') {
      return NextResponse.json({ detail: 'This month is already closed' }, { status: 409 })
    }
    const msg = err instanceof Error ? err.message : 'Failed to close month'
    return NextResponse.json({ detail: msg }, { status: 500 })
  }
}
