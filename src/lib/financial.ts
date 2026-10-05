/**
 * financial.ts — Server-only shared financial logic.
 * Used by API routes. Never import from client components.
 */

import { prisma } from '@/lib/prisma'
import { DEFAULT_CUTOFF_TIME, DEFAULT_TIMEZONE } from './constants'
import { resolvePeriod, calculateNextPeriod } from './period'

// ─── Date helpers ─────────────────────────────────────────────────────────────

/** Legacy calendar-month range. Kept for migration backfill only. */
export function monthRange(yearMonth: string): { start: Date; end: Date } {
  const [y, m] = yearMonth.split('-').map(Number)
  const start = new Date(`${yearMonth}-01T00:00:00.000Z`)
  const end = new Date(
    `${yearMonth}-${new Date(y, m, 0).getDate().toString().padStart(2, '0')}T00:00:00.000Z`
  )
  return { start, end }
}

// ─── Meal counting ────────────────────────────────────────────────────────────

type MealSlotData = {
  breakfastCount: number
  lunchCount: number
  dinnerCount: number
  guestCount: number
}

/**
 * Sum all meal portions (breakfastCount + lunchCount + dinnerCount + guestCount)
 * across all log rows. Uses integer counts — 0 means not eating, 1+ means portions.
 */
export function countMealSlots(logs: MealSlotData[]): number {
  return logs.reduce(
    (s, l) => s + l.breakfastCount + l.lunchCount + l.dinnerCount + l.guestCount,
    0
  )
}

// ─── Cutoff helpers ───────────────────────────────────────────────────────────

/**
 * Extract HH:MM string from a Prisma @db.Time field.
 * Prisma stores Time as a DateTime with date 1970-01-01, so we slice the ISO string.
 */
export function extractCutoffTime(cutOffTime: Date | null | undefined): string {
  return cutOffTime ? cutOffTime.toISOString().slice(11, 16) : DEFAULT_CUTOFF_TIME
}

/**
 * Check whether the cutoff has passed for a given date in the mess's timezone.
 * Uses Intl — no external library needed.
 *
 * Returns false for any date other than today (past/future dates have no cutoff).
 */
export function isCutoffPassed(
  cutoffHHMM: string,
  checkDate: string,
  timezone: string = DEFAULT_TIMEZONE,
): boolean {
  const todayInTz = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date())
  if (checkDate !== todayInTz) return false

  const nowTimeInTz = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
    hour12: false,
  }).format(new Date())

  return nowTimeInTz >= cutoffHHMM
}

// ─── Balance helpers ──────────────────────────────────────────────────────────

/**
 * Single source of truth for member balance.
 * balance = amount contributed − meals eaten × meal rate
 */
export function calculateMemberBalance(
  contributed: number,
  memberMeals: number,
  mealRate: number,
): number {
  return contributed - memberMeals * mealRate
}

// ─── Voided-expense filter ────────────────────────────────────────────────────

/**
 * Single source of truth for the Prisma where clause that excludes expenses
 * belonging to voided bazaar sessions. Use this everywhere instead of
 * inlining the OR condition.
 */
export function nonVoidedExpenseWhere(messId: string, start: Date, end: Date) {
  return {
    messId,
    expenseDate: { gte: start, lte: end },
    OR: [{ sessionId: null as string | null }, { session: { isVoided: false } }],
  }
}

// ─── Month stats ──────────────────────────────────────────────────────────────

/**
 * Single source of truth for period-level financial stats.
 * Returns totalExpense, totalMeals, and mealRate — all excluding voided sessions.
 * Uses explicit start/end dates from the period.
 */
export async function calculateMonthStats(
  messId: string,
  yearMonth: string,
): Promise<{ totalExpense: number; totalMeals: number; mealRate: number }> {
  const period = await resolvePeriod(messId, yearMonth)
  return calculateStatsForRange(messId, period.start, period.end)
}

/**
 * Calculate stats for an explicit date range (no yearMonth resolution needed).
 */
export async function calculateStatsForRange(
  messId: string,
  start: Date,
  end: Date,
): Promise<{ totalExpense: number; totalMeals: number; mealRate: number }> {
  const [exps, logs] = await Promise.all([
    prisma.expense.findMany({
      where: nonVoidedExpenseWhere(messId, start, end),
      select: { amount: true },
    }),
    prisma.dailyLog.findMany({
      where: { messId, logDate: { gte: start, lte: end } },
      select: { breakfastCount: true, lunchCount: true, dinnerCount: true, guestCount: true },
    }),
  ])

  const totalExpense = exps.reduce((s, e) => s + Number(e.amount), 0)
  const totalMeals = countMealSlots(logs)
  return { totalExpense, totalMeals, mealRate: totalMeals > 0 ? totalExpense / totalMeals : 0 }
}

/**
 * Convenience wrapper — use calculateMonthStats when you also need
 * totalExpense or totalMeals alongside the rate.
 */
export async function calculateMealRate(messId: string, yearMonth: string): Promise<number> {
  return (await calculateMonthStats(messId, yearMonth)).mealRate
}

// ─── Month closing ────────────────────────────────────────────────────────────

/**
 * Close a period: freeze logs, create ledger entries, carry forward balances,
 * and create the next period with optional manager assignment.
 * ⚠️ IRREVERSIBLE — wrapped in a Prisma transaction.
 * Throws if period is already closed.
 */
export async function closeMonth(
  messId: string,
  yearMonth: string,
  adminId: string,
  nextManagerId?: string | null,
): Promise<{ mealRate: number; totalExpense: number; totalMeals: number; nextPeriod: { yearMonth: string; startDate: string; endDate: string } }> {
  // Look up the period
  const period = await resolvePeriod(messId, yearMonth)
  const { start, end } = period

  if (period.isClosed) throw new Error('Month is already closed')

  // Get mess config for next period calculation
  const mess = await prisma.mess.findUnique({
    where: { id: messId },
    select: { monthStartDay: true },
  })
  const monthStartDay = mess?.monthStartDay ?? 1

  const [members, logs, expenses] = await Promise.all([
    prisma.member.findMany({ where: { messId, isActive: true }, select: { id: true } }),
    prisma.dailyLog.findMany({
      where: { messId, logDate: { gte: start, lte: end } },
      select: { memberId: true, breakfastCount: true, lunchCount: true, dinnerCount: true, guestCount: true },
    }),
    // Exclude expenses from voided sessions
    prisma.expense.findMany({
      where: nonVoidedExpenseWhere(messId, start, end),
      select: { amount: true, addedBy: true },
    }),
  ])

  const totalExpense = expenses.reduce((s, e) => s + Number(e.amount), 0)
  const totalMeals = countMealSlots(logs)
  const mealRate = totalMeals > 0 ? totalExpense / totalMeals : 0

  // Calculate next period dates
  const nextPeriodDates = calculateNextPeriod(end, monthStartDay)

  const nextPeriodResult = await prisma.$transaction(async (tx) => {
    // Close current period
    await tx.messMonth.update({
      where: { id: period.id },
      data: {
        isClosed: true,
        closedAt: new Date(),
        mealRate,
        totalExpense,
      },
    })

    // Freeze all logs in the period
    await tx.dailyLog.updateMany({
      where: { messId, logDate: { gte: start, lte: end } },
      data: { frozen: true },
    })

    // Create deduction ledger entries for each member
    const deductions = members.map((member) => {
      const memberMeals = countMealSlots(logs.filter((l) => l.memberId === member.id))
      return {
        messId,
        messMonthId: period.id,
        memberId: member.id,
        entryType: 'DEDUCTION',
        amount: -(memberMeals * mealRate),
        note: `Meal deduction for ${yearMonth}: ${memberMeals} meals × ৳${mealRate.toFixed(2)}`,
        createdBy: adminId,
      }
    })
    if (deductions.length > 0) await tx.ledgerEntry.createMany({ data: deductions })

    // Create NEXT period
    const nextMonth = await tx.messMonth.upsert({
      where: { messId_yearMonth: { messId, yearMonth: nextPeriodDates.yearMonth } },
      create: {
        messId,
        yearMonth: nextPeriodDates.yearMonth,
        startDate: nextPeriodDates.startDate,
        endDate: nextPeriodDates.endDate,
        managerId: nextManagerId || null,
        isClosed: false,
      },
      update: {},
    })

    // Create carry-forward ledger entries into next period
    const carryForwards = members.map((member) => {
      const memberLogs = logs.filter((l) => l.memberId === member.id)
      const memberMeals = countMealSlots(memberLogs)
      const contributed = expenses
        .filter((e) => e.addedBy === member.id)
        .reduce((s, e) => s + Number(e.amount), 0)
      return {
        messId,
        messMonthId: nextMonth.id,
        memberId: member.id,
        entryType: 'CARRY_FORWARD',
        amount: contributed - memberMeals * mealRate,
        note: `Carry forward from ${yearMonth}`,
        createdBy: adminId,
      }
    })
    if (carryForwards.length > 0) await tx.ledgerEntry.createMany({ data: carryForwards })

    // Audit log
    await tx.auditLog.create({
      data: {
        messId,
        actorId: adminId,
        action: 'CLOSE_MONTH',
        targetTable: 'mess_months',
        targetId: period.id,
        newValue: {
          year_month: yearMonth,
          meal_rate: mealRate,
          total_expense: totalExpense,
          total_meals: totalMeals,
          next_period: nextPeriodDates.yearMonth,
          next_manager_id: nextManagerId || null,
        },
      },
    })

    return nextMonth
  })

  return {
    mealRate,
    totalExpense,
    totalMeals,
    nextPeriod: {
      yearMonth: nextPeriodResult.yearMonth,
      startDate: nextPeriodResult.startDate.toISOString().slice(0, 10),
      endDate: nextPeriodResult.endDate.toISOString().slice(0, 10),
    },
  }
}
