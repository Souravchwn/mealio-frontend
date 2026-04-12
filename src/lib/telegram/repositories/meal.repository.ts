/**
 * MealRepository — daily log persistence for the Telegram bot.
 */

import { prisma } from '@/lib/prisma'

export interface DailyLogRow {
  id: string
  breakfast: boolean
  lunch: boolean
  dinner: boolean
  guestCount: number
  frozen: boolean
}

export interface ExpenseRow {
  amount: number
}

export interface LogSlotRow {
  breakfast: boolean
  lunch: boolean
  dinner: boolean
  guestCount: number
}

export class MealRepository {
  private dateObj(date: string): Date {
    return new Date(`${date}T00:00:00.000Z`)
  }

  async findLog(memberId: string, messId: string, date: string): Promise<DailyLogRow | null> {
    return prisma.dailyLog.findFirst({
      where: { memberId, messId, logDate: this.dateObj(date) },
      select: { id: true, breakfast: true, lunch: true, dinner: true, guestCount: true, frozen: true },
    })
  }

  async upsertLog(memberId: string, messId: string, date: string, data: Partial<{
    breakfast: boolean
    lunch: boolean
    dinner: boolean
    guestCount: number
    frozen: boolean
  }>): Promise<DailyLogRow> {
    const dateObj = this.dateObj(date)
    const defaults = { breakfast: true, lunch: true, dinner: true, guestCount: 0, frozen: false }
    return prisma.dailyLog.upsert({
      where: { messId_memberId_logDate: { messId, memberId, logDate: dateObj } },
      create: { memberId, messId, logDate: dateObj, ...defaults, ...data },
      update: data,
      select: { id: true, breakfast: true, lunch: true, dinner: true, guestCount: true, frozen: true },
    })
  }

  async updateLog(id: string, data: Partial<{
    breakfast: boolean
    lunch: boolean
    dinner: boolean
    guestCount: number
  }>): Promise<void> {
    await prisma.dailyLog.update({ where: { id }, data })
  }

  /** Bulk upsert for all members (nomeal / mealon commands). */
  async bulkUpsertLogs(
    memberIds: string[],
    messId: string,
    date: string,
    data: { breakfast: boolean; lunch: boolean; dinner: boolean },
  ): Promise<void> {
    const dateObj = this.dateObj(date)
    await Promise.all(
      memberIds.map((memberId) =>
        prisma.dailyLog.upsert({
          where: { messId_memberId_logDate: { messId, memberId, logDate: dateObj } },
          create: { memberId, messId, logDate: dateObj, guestCount: 0, frozen: false, ...data },
          update: data,
        }),
      ),
    )
  }

  async getMonthExpenses(messId: string, start: Date, end: Date): Promise<ExpenseRow[]> {
    return prisma.expense.findMany({
      where: { messId, expenseDate: { gte: start, lte: end } },
      select: { amount: true },
    }).then((rows) => rows.map((r) => ({ amount: Number(r.amount) })))
  }

  async getMemberMonthExpenses(memberId: string, start: Date, end: Date): Promise<ExpenseRow[]> {
    return prisma.expense.findMany({
      where: { addedBy: memberId, expenseDate: { gte: start, lte: end } },
      select: { amount: true },
    }).then((rows) => rows.map((r) => ({ amount: Number(r.amount) })))
  }

  async getMonthLogs(messId: string, start: Date, end: Date): Promise<LogSlotRow[]> {
    return prisma.dailyLog.findMany({
      where: { messId, logDate: { gte: start, lte: end } },
      select: { breakfast: true, lunch: true, dinner: true, guestCount: true },
    })
  }

  async getMemberMonthLogs(memberId: string, start: Date, end: Date): Promise<LogSlotRow[]> {
    return prisma.dailyLog.findMany({
      where: { memberId, logDate: { gte: start, lte: end } },
      select: { breakfast: true, lunch: true, dinner: true, guestCount: true },
    })
  }
}
