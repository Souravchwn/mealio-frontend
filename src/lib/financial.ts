/**
 * financial.ts — Server-only shared financial logic.
 * Used by API routes. Never import from client components.
 */

import { prisma } from '@/lib/prisma'
import { DEFAULT_CUTOFF_TIME, DEFAULT_TIMEZONE } from './constants'

// ─── Date helpers ─────────────────────────────────────────────────────────────

/** Parse "YYYY-MM" into UTC Date boundaries for Prisma date-range queries. */
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
  guestBreakfastCount: number
  guestLunchCount: number
  guestDinnerCount: number
}

/**
 * Sum all billed meal portions across all log rows.
 * A host's billed portions for a slot = own slot count + that slot's guest count,
 * so guests are billed to the host member (their counts live on the host's log).
 * Uses integer counts — 0 means not eating, 1+ means portions.
 */
export function countMealSlots(logs: MealSlotData[]): number {
  return logs.reduce(
    (s, l) =>
      s + l.breakfastCount + l.lunchCount + l.dinnerCount
        + l.guestBreakfastCount + l.guestLunchCount + l.guestDinnerCount,
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

// ─── Rate calculation ─────────────────────────────────────────────────────────

/**
 * Calculate the live meal rate for a given mess and month.
 * meal_rate = total_expenses / total_meal_slots
 */
export async function calculateMealRate(messId: string, yearMonth: string): Promise<number> {
  const { start, end } = monthRange(yearMonth)

  const [exps, logs] = await Promise.all([
    prisma.expense.findMany({
      where: { messId, expenseDate: { gte: start, lte: end } },
      select: { amount: true },
    }),
    prisma.dailyLog.findMany({
      where: { messId, logDate: { gte: start, lte: end } },
      select: {
        breakfastCount: true, lunchCount: true, dinnerCount: true,
        guestBreakfastCount: true, guestLunchCount: true, guestDinnerCount: true,
      },
    }),
  ])

  const totalExpense = exps.reduce((s, e) => s + Number(e.amount), 0)
  const totalSlots = countMealSlots(logs)
  return totalSlots === 0 ? 0 : totalExpense / totalSlots
}

// ─── Month closing ────────────────────────────────────────────────────────────

/**
 * Close a month: freeze logs, create ledger entries, carry forward balances.
 * ⚠️ IRREVERSIBLE — wrapped in a Prisma transaction.
 * Throws if month is already closed.
 */
export async function closeMonth(
  messId: string,
  yearMonth: string,
  adminId: string
): Promise<{ mealRate: number; totalExpense: number; totalMeals: number }> {
  const { start, end } = monthRange(yearMonth)

  const existingMonth = await prisma.messMonth.findFirst({
    where: { messId, yearMonth },
    select: { isClosed: true },
  })
  if (existingMonth?.isClosed) throw new Error('Month is already closed')

  const [members, logs, expenses] = await Promise.all([
    prisma.member.findMany({ where: { messId, isActive: true }, select: { id: true } }),
    prisma.dailyLog.findMany({
      where: { messId, logDate: { gte: start, lte: end } },
      select: {
        memberId: true, breakfastCount: true, lunchCount: true, dinnerCount: true,
        guestBreakfastCount: true, guestLunchCount: true, guestDinnerCount: true,
      },
    }),
    prisma.expense.findMany({
      where: { messId, expenseDate: { gte: start, lte: end } },
      select: { amount: true, addedBy: true },
    }),
  ])

  const totalExpense = expenses.reduce((s, e) => s + Number(e.amount), 0)
  const totalMeals = countMealSlots(logs)
  const mealRate = totalMeals > 0 ? totalExpense / totalMeals : 0

  await prisma.$transaction(async (tx) => {
    const messMonth = await tx.messMonth.upsert({
      where: { messId_yearMonth: { messId, yearMonth } },
      create: { messId, yearMonth, isClosed: true, closedAt: new Date(), mealRate, totalExpense },
      update: { isClosed: true, closedAt: new Date(), mealRate, totalExpense },
    })

    await tx.dailyLog.updateMany({
      where: { messId, logDate: { gte: start, lte: end } },
      data: { frozen: true },
    })

    const deductions = members.map((member) => {
      const memberMeals = countMealSlots(logs.filter((l) => l.memberId === member.id))
      return {
        messId,
        messMonthId: messMonth.id,
        memberId: member.id,
        entryType: 'DEDUCTION',
        amount: -(memberMeals * mealRate),
        note: `Meal deduction for ${yearMonth}: ${memberMeals} meals \u00d7 \u09f3${mealRate.toFixed(2)}`,
        createdBy: adminId,
      }
    })
    if (deductions.length > 0) await tx.ledgerEntry.createMany({ data: deductions })

    // Next month for carry-forward
    const [y, m] = yearMonth.split('-').map(Number)
    const nextDate = new Date(y, m, 1) // m is 1-indexed, so new Date(y, m, 1) = first day of next month
    const nextYearMonth = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`

    const nextMonth = await tx.messMonth.upsert({
      where: { messId_yearMonth: { messId, yearMonth: nextYearMonth } },
      create: { messId, yearMonth: nextYearMonth, isClosed: false },
      update: {},
    })

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

    await tx.auditLog.create({
      data: {
        messId,
        actorId: adminId,
        action: 'CLOSE_MONTH',
        targetTable: 'mess_months',
        targetId: messMonth.id,
        newValue: { year_month: yearMonth, meal_rate: mealRate, total_expense: totalExpense, total_meals: totalMeals },
      },
    })
  })

  return { mealRate, totalExpense, totalMeals }
}
