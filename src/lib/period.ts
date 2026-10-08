/**
 * period.ts — Server-only period lookup helpers.
 * Replaces the old calendar-month `monthRange()` approach.
 *
 * A "period" is a MessMonth row with explicit startDate/endDate.
 * The admin/manager manually closes periods — no automatic month change.
 */

import { prisma } from '@/lib/prisma'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Period {
  id: string
  messId: string
  yearMonth: string
  startDate: Date
  endDate: Date
  isClosed: boolean
  managerId: string | null
}

export interface PeriodRange {
  start: Date
  end: Date
}

// ─── Lookups ──────────────────────────────────────────────────────────────────

/**
 * Get the current OPEN period for a mess.
 * If none exists, returns null (mess may not have been initialized yet).
 */
export async function getCurrentPeriod(messId: string): Promise<Period | null> {
  const row = await prisma.messMonth.findFirst({
    where: { messId, isClosed: false },
    orderBy: { startDate: 'desc' },
    select: {
      id: true,
      messId: true,
      yearMonth: true,
      startDate: true,
      endDate: true,
      isClosed: true,
      managerId: true,
    },
  })
  return row
}

/**
 * Get a specific period by its yearMonth label for a mess.
 * Falls back to calendar-month boundaries if no MessMonth row exists.
 */
export async function getPeriodByLabel(messId: string, yearMonth: string): Promise<Period | null> {
  const row = await prisma.messMonth.findUnique({
    where: { messId_yearMonth: { messId, yearMonth } },
    select: {
      id: true,
      messId: true,
      yearMonth: true,
      startDate: true,
      endDate: true,
      isClosed: true,
      managerId: true,
    },
  })
  return row
}

/**
 * Resolve a yearMonth param to a Period.
 * - If yearMonth is provided, look it up by label.
 * - If not provided, use the current open period.
 * - If neither exists, creates a fallback period using calendar-month boundaries.
 *
 * This is the main entry point for API routes.
 */
export async function resolvePeriod(
  messId: string,
  yearMonth?: string | null,
): Promise<Period & PeriodRange> {
  let period: Period | null = null

  if (yearMonth) {
    period = await getPeriodByLabel(messId, yearMonth)
  }

  if (!period) {
    period = await getCurrentPeriod(messId)
  }

  if (period) {
    return {
      ...period,
      start: period.startDate,
      end: period.endDate,
    }
  }

  // Fallback: no MessMonth exists yet — create one using calendar-month boundaries
  const ym = yearMonth || new Date().toISOString().slice(0, 7)
  const mess = await prisma.mess.findUnique({
    where: { id: messId },
    select: { monthStartDay: true },
  })
  const monthStartDay = mess?.monthStartDay ?? 1
  const { startDate, endDate } = calculatePeriodDates(ym, monthStartDay)

  const created = await prisma.messMonth.upsert({
    where: { messId_yearMonth: { messId, yearMonth: ym } },
    create: {
      messId,
      yearMonth: ym,
      startDate,
      endDate,
      isClosed: false,
    },
    update: {},
    select: {
      id: true,
      messId: true,
      yearMonth: true,
      startDate: true,
      endDate: true,
      isClosed: true,
      managerId: true,
    },
  })

  return { ...created, start: created.startDate, end: created.endDate }
}

// ─── Date calculations ────────────────────────────────────────────────────────

/**
 * Calculate period start/end dates from a yearMonth label and a monthStartDay.
 *
 * Example: yearMonth = "2026-05", monthStartDay = 10
 *   → startDate = 2026-05-10
 *   → endDate   = 2026-06-09
 *
 * Example: yearMonth = "2026-05", monthStartDay = 1
 *   → startDate = 2026-05-01
 *   → endDate   = 2026-05-31  (calendar month)
 */
export function calculatePeriodDates(
  yearMonth: string,
  monthStartDay: number,
): { startDate: Date; endDate: Date } {
  const [y, m] = yearMonth.split('-').map(Number)

  // Start date: the monthStartDay of the given month
  // Clamp to last valid day of that month
  const maxDay = new Date(y, m, 0).getDate()
  const clampedStart = Math.min(monthStartDay, maxDay)
  const startDate = new Date(`${y}-${String(m).padStart(2, '0')}-${String(clampedStart).padStart(2, '0')}T00:00:00.000Z`)

  // End date: the day before monthStartDay of the NEXT month
  let endYear = y
  let endMonth = m + 1
  if (endMonth > 12) {
    endMonth = 1
    endYear++
  }

  if (monthStartDay === 1) {
    // Calendar month mode: end = last day of the same month
    const endDate = new Date(`${y}-${String(m).padStart(2, '0')}-${String(maxDay).padStart(2, '0')}T00:00:00.000Z`)
    return { startDate, endDate }
  }

  // Custom start day: end = (monthStartDay - 1) of next month
  const maxEndDay = new Date(endYear, endMonth, 0).getDate()
  const endDay = Math.min(monthStartDay - 1, maxEndDay)
  const endDate = new Date(
    `${endYear}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}T00:00:00.000Z`
  )
  return { startDate, endDate }
}

/**
 * Calculate the NEXT period after a given end date.
 * Next period starts the day after the previous period ends.
 */
export function calculateNextPeriod(
  prevEndDate: Date,
  monthStartDay: number,
): { startDate: Date; endDate: Date; yearMonth: string } {
  // Next period starts the day after prev ends
  const next = new Date(prevEndDate)
  next.setUTCDate(next.getUTCDate() + 1)

  const nextYear = next.getUTCFullYear()
  const nextMonth = next.getUTCMonth() + 1
  const yearMonth = `${nextYear}-${String(nextMonth).padStart(2, '0')}`

  // The period always starts exactly the day after the previous one ends; only its end comes from the calendar
  const { endDate } = calculatePeriodDates(yearMonth, monthStartDay)
  return { startDate: next, endDate, yearMonth }
}

/**
 * Format a period for display: "May 10 → Jun 9, 2026"
 */
export function formatPeriodLabel(startDate: Date, endDate: Date): string {
  const startStr = startDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
  const endStr = endDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
  return `${startStr} → ${endStr}`
}

export type DateCheck = { ok: true } | { ok: false; detail: string }

const fmtDay = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

/**
 * Money records (expenses, bazaar trips, deposits) must be dated inside the OPEN period.
 * A record dated anywhere else would be stored but counted in no period, so it would
 * silently vanish from the books. Say so up front instead.
 */
export async function checkDateInOpenPeriod(messId: string, date: Date): Promise<DateCheck> {
  const open = await resolvePeriod(messId)
  if (date >= open.start && date <= open.end) return { ok: true }
  if (await isDateInClosedPeriod(messId, date)) {
    return { ok: false, detail: 'That date is in a closed month and can no longer be changed' }
  }
  if (date > open.end) {
    return {
      ok: false,
      detail: `That date is after this period ends (${fmtDay(open.end)}). Close the period first, then add it to the new one.`,
    }
  }
  return { ok: false, detail: `That date is before this period starts (${fmtDay(open.start)}).` }
}

/**
 * True when `date` falls inside a CLOSED period of the mess. Expenses and
 * sessions dated in a closed period must not change — the period's numbers
 * have already been settled into the ledger.
 */
export async function isDateInClosedPeriod(messId: string, date: Date): Promise<boolean> {
  const closed = await prisma.messMonth.findFirst({
    where: { messId, isClosed: true, startDate: { lte: date }, endDate: { gte: date } },
    select: { id: true },
  })
  return !!closed
}
