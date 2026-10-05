import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { calculatePeriodSummary } from '@/lib/financial'
import { resolvePeriod } from '@/lib/period'

export async function GET(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const yearMonth = searchParams.get('year_month') || null

  try {
    const period = await resolvePeriod(payload.messId, yearMonth)
    const summary = await calculatePeriodSummary(payload.messId, period)
    const me = summary.forMember(payload.sub)

    return NextResponse.json({
      member_id:         payload.sub,
      year_month:        period.yearMonth,
      start_date:        period.startDate.toISOString().slice(0, 10),
      end_date:          period.endDate.toISOString().slice(0, 10),
      meal_rate:         summary.mealRate,
      total_expense:     summary.totalExpense,
      guest_meal_policy: summary.guestMealPolicy,
      // Billable meals: own meals (+ guest meals when the host pays)
      my_meal_count:     me.billableMeals,
      own_meal_count:    me.ownMeals,
      guest_meal_count:  me.guestMeals,
      deposited:         me.deposited,
      carried_forward:   me.carriedForward,
      contributed:       me.contributed,
      meal_cost:         me.mealCost,
      balance:           me.balance,
    })
  } catch (err) {
    console.error('[GET /api/members/me] member=%s', payload.sub, err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
