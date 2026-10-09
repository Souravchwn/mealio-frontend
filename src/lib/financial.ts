/**
 * financial.ts — Server-only shared financial logic.
 * Used by API routes and the Telegram bot. Never import from client components.
 *
 * `calculatePeriodSummary()` is the ONE place meal counts, meal rate and
 * member balances are calculated. Every screen (matrix, members, my-summary,
 * overview, Telegram /rate and /balance) and month closing use it, so they
 * always agree.
 */

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { CURRENCY_SYMBOL, DEFAULT_CUTOFF_TIME, DEFAULT_TIMEZONE, type GuestMealPolicy } from './constants'
import { resolvePeriod, calculateNextPeriod, type Period, type PeriodRange } from './period'
import { requireMessSettings, todayIn } from './mess-settings'
import { ensureDailyLogs } from './daily-logs'
import { dayGuestMeals, GUEST_SELECT, type GuestLogData } from './guests'

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

/**
 * Period end dates are stored as DATE (midnight). For timestamp columns
 * (ledger createdAt) the period must include the whole last day.
 */
export function endOfPeriodExclusive(end: Date): Date {
  return new Date(end.getTime() + 24 * 60 * 60 * 1000)
}

// ─── Meal counting ────────────────────────────────────────────────────────────

type MealSlotData = GuestLogData

/** The member's own portions for one day. */
export function ownMeals(log: MealSlotData): number {
  return log.breakfastCount + log.lunchCount + log.dinnerCount
}

/**
 * Guest portions for one day: the guests of each meal (src/lib/guests.ts).
 * Older days stored one guest count for every meal the host ate; those still count that way.
 */
export function guestMeals(log: MealSlotData): number {
  return dayGuestMeals(log)
}

/**
 * Billable meals for a set of logs under the mess's guest policy.
 *  HOST   → own + guest meals (the host pays for their guests)
 *  SHARED → own meals only (guest food cost is spread through the meal rate)
 */
export function countMealSlots(logs: MealSlotData[], policy: GuestMealPolicy): number {
  return logs.reduce((s, l) => s + ownMeals(l) + (policy === 'HOST' ? guestMeals(l) : 0), 0)
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

// ─── Voided-expense filter ────────────────────────────────────────────────────

/**
 * Single source of truth for the Prisma where clause that excludes expenses
 * belonging to voided bazaar sessions.
 */
export function nonVoidedExpenseWhere(messId: string, start: Date, end: Date) {
  return {
    messId,
    expenseDate: { gte: start, lte: end },
    OR: [{ sessionId: null as string | null }, { session: { isVoided: false } }],
  }
}

// ─── Period summary ───────────────────────────────────────────────────────────

export interface MemberPeriodSummary {
  memberId: string
  /** Member's own portions */
  ownMeals: number
  /** Portions eaten by guests this member brought */
  guestMeals: number
  /** Meals the member is charged for (own + guests under the HOST policy) */
  billableMeals: number
  /** Cash deposits (CONTRIBUTION ledger entries) */
  deposited: number
  /** Bazaar spending credited to the member (only when bazaarCountsAsDeposit) */
  bazaarCredit: number
  /** Balance carried forward from the previous closed period */
  carriedForward: number
  /** deposited + bazaarCredit + carriedForward */
  contributed: number
  mealCost: number
  /** contributed − mealCost. Positive = the mess owes the member. */
  balance: number
}

export interface PeriodSummary {
  guestMealPolicy: GuestMealPolicy
  bazaarCountsAsDeposit: boolean
  totalExpense: number
  /** Sum of billable meals across the mess — the meal-rate denominator */
  totalMeals: number
  totalGuestMeals: number
  mealRate: number
  members: Map<string, MemberPeriodSummary>
  /** Summary for one member (zeros if they had no activity) */
  forMember(memberId: string): MemberPeriodSummary
}

function emptyMember(memberId: string): MemberPeriodSummary {
  return {
    memberId, ownMeals: 0, guestMeals: 0, billableMeals: 0, deposited: 0, bazaarCredit: 0,
    carriedForward: 0, contributed: 0, mealCost: 0, balance: 0,
  }
}

/**
 * Every figure of a period, frozen when it is closed. Stored on MessMonth.snapshot.
 * Member names are NOT stored (they are looked up when shown), so deleting an account
 * still removes the person's name from the archive.
 */
export interface PeriodSnapshot {
  version: 1
  takenAt: string
  guestMealPolicy: GuestMealPolicy
  bazaarCountsAsDeposit: boolean
  carryForwardBalance: boolean
  totalExpense: number
  totalMeals: number
  totalGuestMeals: number
  mealRate: number
  members: MemberPeriodSummary[]
}

export function buildSnapshot(summary: PeriodSummary, carryForwardBalance: boolean): PeriodSnapshot {
  return {
    version: 1,
    takenAt: new Date().toISOString(),
    guestMealPolicy: summary.guestMealPolicy,
    bazaarCountsAsDeposit: summary.bazaarCountsAsDeposit,
    carryForwardBalance,
    totalExpense: summary.totalExpense,
    totalMeals: summary.totalMeals,
    totalGuestMeals: summary.totalGuestMeals,
    mealRate: summary.mealRate,
    members: Array.from(summary.members.values()),
  }
}

function summaryFromSnapshot(snap: PeriodSnapshot): PeriodSummary {
  const members = new Map(snap.members.map((m) => [m.memberId, m]))
  return {
    guestMealPolicy: snap.guestMealPolicy,
    bazaarCountsAsDeposit: snap.bazaarCountsAsDeposit,
    totalExpense: snap.totalExpense,
    totalMeals: snap.totalMeals,
    totalGuestMeals: snap.totalGuestMeals,
    mealRate: snap.mealRate,
    members,
    forMember: (id: string) => members.get(id) ?? emptyMember(id),
  }
}

/**
 * Calculate every financial number for a period using the mess settings
 * (guest policy, bazaar credit rule) served from Redis.
 * Backfills any missing daily logs first (replaces the old cron job).
 */
export async function calculatePeriodSummary(
  messId: string,
  period: Pick<Period, 'id' | 'isClosed'> & PeriodRange,
): Promise<PeriodSummary> {
  // A closed period is history. Read it from its frozen snapshot, never recalculate it:
  // today's settings (guest policy, bazaar credit, ...) must not rewrite a settled month.
  if (period.isClosed) {
    const row = await prisma.messMonth.findUnique({ where: { id: period.id }, select: { snapshot: true } })
    if (row?.snapshot) return summaryFromSnapshot(row.snapshot as unknown as PeriodSnapshot)
  }

  await ensureDailyLogs(messId)
  const settings = await requireMessSettings(messId)
  const policy = settings.guestMealPolicy
  const { start, end } = period

  // An open period only counts meals up to today. Days members planned ahead
  // (e.g. "lunch ×2 next Friday") must not change today's meal rate.
  const todayObj = new Date(`${todayIn(settings.timezone)}T00:00:00.000Z`)
  const mealEnd = !period.isClosed && todayObj < end ? todayObj : end

  const [logs, expenses, ledger, members] = await Promise.all([
    prisma.dailyLog.findMany({
      where: { messId, logDate: { gte: start, lte: mealEnd } },
      select: { memberId: true, logDate: true, breakfastCount: true, lunchCount: true, dinnerCount: true, ...GUEST_SELECT },
    }),
    prisma.expense.findMany({
      where: nonVoidedExpenseWhere(messId, start, end),
      select: { amount: true, addedBy: true },
    }),
    prisma.ledgerEntry.findMany({
      where: {
        messId,
        isVoided: false,
        OR: [
          { entryType: 'CONTRIBUTION', createdAt: { gte: start, lt: endOfPeriodExclusive(end) } },
          { entryType: 'CARRY_FORWARD', messMonthId: period.id },
        ],
      },
      select: { memberId: true, entryType: true, amount: true },
    }),
    prisma.member.findMany({
      where: { messId },
      select: { id: true, joinedAt: true },
    }),
  ])

  // Ignore logs dated before the member joined (phantom rows) — for the member
  // AND the mess total, so charges still add up to the total expense.
  const joinedDate = new Map(members.map((m) => [m.id, m.joinedAt.toISOString().slice(0, 10)]))
  const validLogs = logs.filter((l) => {
    const joined = joinedDate.get(l.memberId)
    return !joined || l.logDate.toISOString().slice(0, 10) >= joined
  })

  const byMember = new Map<string, MemberPeriodSummary>()
  const get = (id: string) => {
    let row = byMember.get(id)
    if (!row) {
      row = emptyMember(id)
      byMember.set(id, row)
    }
    return row
  }

  let totalMeals = 0
  let totalGuestMeals = 0
  for (const l of validLogs) {
    const row = get(l.memberId)
    const own = ownMeals(l)
    const guests = guestMeals(l)
    const billable = own + (policy === 'HOST' ? guests : 0)
    row.ownMeals += own
    row.guestMeals += guests
    row.billableMeals += billable
    totalGuestMeals += guests
    totalMeals += billable
  }

  const totalExpense = expenses.reduce((s, e) => s + Number(e.amount), 0)
  const mealRate = totalMeals > 0 ? totalExpense / totalMeals : 0

  if (settings.bazaarCountsAsDeposit) {
    for (const e of expenses) if (e.addedBy) get(e.addedBy).bazaarCredit += Number(e.amount)
  }
  for (const entry of ledger) {
    const row = get(entry.memberId)
    if (entry.entryType === 'CONTRIBUTION') row.deposited += Number(entry.amount)
    else row.carriedForward += Number(entry.amount)
  }

  for (const row of byMember.values()) {
    row.contributed = row.deposited + row.bazaarCredit + row.carriedForward
    row.mealCost = row.billableMeals * mealRate
    row.balance = row.contributed - row.mealCost
  }

  const result: PeriodSummary = {
    guestMealPolicy: policy,
    bazaarCountsAsDeposit: settings.bazaarCountsAsDeposit,
    totalExpense,
    totalMeals,
    totalGuestMeals,
    mealRate,
    members: byMember,
    forMember: (id: string) => byMember.get(id) ?? emptyMember(id),
  }

  // A period closed before snapshots existed: freeze it now, the first time it is read.
  if (period.isClosed) {
    await prisma.messMonth
      .updateMany({
        where: { id: period.id, snapshot: { equals: Prisma.DbNull } },
        data: { snapshot: buildSnapshot(result, settings.carryForwardBalance) as unknown as Prisma.InputJsonValue },
      })
      .catch((err) => console.error('[calculatePeriodSummary] could not snapshot closed period', err))
  }
  return result
}

// ─── Month stats ──────────────────────────────────────────────────────────────

/** Period-level stats: totalExpense, totalMeals and mealRate. */
export async function calculateMonthStats(
  messId: string,
  yearMonth: string | null,
): Promise<{ totalExpense: number; totalMeals: number; mealRate: number }> {
  const period = await resolvePeriod(messId, yearMonth)
  const { totalExpense, totalMeals, mealRate } = await calculatePeriodSummary(messId, period)
  return { totalExpense, totalMeals, mealRate }
}

/** Convenience wrapper — returns just the meal rate for a period. */
export async function calculateMealRate(messId: string, yearMonth: string | null): Promise<number> {
  return (await calculateMonthStats(messId, yearMonth)).mealRate
}

// ─── Month closing ────────────────────────────────────────────────────────────

export class MonthAlreadyClosedError extends Error {
  constructor() {
    super('Month is already closed')
  }
}

/** Closing before the last day would leave the remaining days unbilled. */
export class PeriodNotFinishedError extends Error {
  constructor(public readonly endDate: string) {
    super(`This period runs until ${endDate}`)
  }
}

/**
 * Close a period: freeze logs, create ledger entries, carry forward balances,
 * and create the next period with optional manager assignment.
 * ⚠️ IRREVERSIBLE — wrapped in a Prisma transaction.
 * Throws MonthAlreadyClosedError if the period is already closed.
 */
export async function closeMonth(
  messId: string,
  yearMonth: string,
  adminId: string,
  nextManagerId?: string | null,
): Promise<{ mealRate: number; totalExpense: number; totalMeals: number; nextPeriod: { yearMonth: string; startDate: string; endDate: string }; skippedPeriods: number }> {
  const period = await resolvePeriod(messId, yearMonth)
  if (period.isClosed) throw new MonthAlreadyClosedError()

  const settings = await requireMessSettings(messId)
  const endDate = period.end.toISOString().slice(0, 10)
  if (todayIn(settings.timezone) < endDate) throw new PeriodNotFinishedError(endDate)
  const summary = await calculatePeriodSummary(messId, period)
  const { totalExpense, totalMeals, mealRate } = summary
  let nextPeriodDates = calculateNextPeriod(period.end, settings.monthStartDay)
  // A mess that stopped using the app for a while must not get months of empty periods,
  // each one back-filled with default meals. Start the new period at the one containing today.
  const today = new Date(`${todayIn(settings.timezone)}T00:00:00.000Z`)
  let skippedPeriods = 0
  while (nextPeriodDates.endDate < today && skippedPeriods < 240) {
    nextPeriodDates = calculateNextPeriod(nextPeriodDates.endDate, settings.monthStartDay)
    skippedPeriods++
  }

  const nextPeriodResult = await prisma.$transaction(async (tx) => {
    // The isClosed guard makes two simultaneous close requests safe
    const closed = await tx.messMonth.updateMany({
      where: { id: period.id, isClosed: false },
      data: {
        isClosed: true,
        closedAt: new Date(),
        mealRate,
        totalExpense,
        snapshot: buildSnapshot(summary, settings.carryForwardBalance) as unknown as Prisma.InputJsonValue,
      },
    })
    if (closed.count !== 1) throw new MonthAlreadyClosedError()

    await tx.dailyLog.updateMany({
      where: { messId, logDate: { gte: period.start, lte: period.end } },
      data: { frozen: true },
    })

    const rows = Array.from(summary.members.values())

    const deductions = rows
      .filter((r) => r.billableMeals > 0)
      .map((r) => ({
        messId,
        messMonthId: period.id,
        memberId: r.memberId,
        entryType: 'DEDUCTION',
        amount: -r.mealCost,
        note: `Meal deduction for ${period.yearMonth}: ${r.billableMeals} meals × ${CURRENCY_SYMBOL}${mealRate.toFixed(2)}`,
        createdBy: adminId,
      }))
    if (deductions.length > 0) await tx.ledgerEntry.createMany({ data: deductions })

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

    // Carry the full balance (deposits + previous carry-forward − meal cost) forward —
    // unless the mess settles in cash at month end and starts every month at zero
    const carryForwards = !settings.carryForwardBalance ? [] : rows
      .filter((r) => Math.abs(r.balance) >= 0.005)
      .map((r) => ({
        messId,
        messMonthId: nextMonth.id,
        memberId: r.memberId,
        entryType: 'CARRY_FORWARD',
        amount: r.balance,
        note: `Carry forward from ${period.yearMonth}`,
        createdBy: adminId,
      }))
    if (carryForwards.length > 0) await tx.ledgerEntry.createMany({ data: carryForwards })

    await tx.auditLog.create({
      data: {
        messId,
        actorId: adminId,
        action: 'CLOSE_MONTH',
        targetTable: 'mess_months',
        targetId: period.id,
        newValue: {
          year_month: period.yearMonth,
          meal_rate: mealRate,
          total_expense: totalExpense,
          total_meals: totalMeals,
          guest_meal_policy: summary.guestMealPolicy,
          carry_forward_balance: settings.carryForwardBalance,
          next_period: nextPeriodDates.yearMonth,
          skipped_periods: skippedPeriods,
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
    skippedPeriods,
  }
}
