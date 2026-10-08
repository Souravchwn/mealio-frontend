/**
 * GET /api/archive
 * The closed months of the caller's mess, newest first. Open to EVERY member of the mess:
 * the books are shared, so anyone can check them. Read-only; nothing here can be changed.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import type { PeriodSnapshot } from '@/lib/financial'

export async function GET(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  try {
    const periods = await prisma.messMonth.findMany({
      where: { messId: payload.messId, isClosed: true },
      orderBy: { startDate: 'desc' },
      select: { id: true, yearMonth: true, startDate: true, endDate: true, closedAt: true, mealRate: true, totalExpense: true, snapshot: true },
    })
    return NextResponse.json({
      periods: periods.map((p) => {
        const snap = p.snapshot as unknown as PeriodSnapshot | null
        return {
          year_month: p.yearMonth,
          start_date: p.startDate.toISOString().slice(0, 10),
          end_date: p.endDate.toISOString().slice(0, 10),
          closed_at: p.closedAt?.toISOString() ?? null,
          meal_rate: snap?.mealRate ?? Number(p.mealRate ?? 0),
          total_expense: snap?.totalExpense ?? Number(p.totalExpense),
          total_meals: snap?.totalMeals ?? null,
          members: snap?.members.length ?? null,
        }
      }),
    })
  } catch (err) {
    console.error('[GET /api/archive]', err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
