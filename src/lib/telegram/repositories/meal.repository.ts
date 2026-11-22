/**
 * MealRepository — daily log persistence for the Telegram bot.
 * Uses integer meal counts: 0 = skip, 1 = normal portion, 2+ = extra.
 */

import { prisma } from '@/lib/prisma'

export interface DailyLogRow {
  id: string
  breakfastCount: number
  lunchCount: number
  dinnerCount: number
  guestCount: number
  guestBreakfast: number
  guestLunch: number
  guestDinner: number
  frozen: boolean
}

export class MealRepository {
  private dateObj(date: string): Date {
    return new Date(`${date}T00:00:00.000Z`)
  }

  async findLog(memberId: string, messId: string, date: string): Promise<DailyLogRow | null> {
    return prisma.dailyLog.findFirst({
      where: { memberId, messId, logDate: this.dateObj(date) },
      select: {
        id: true,
        breakfastCount: true,
        lunchCount: true,
        dinnerCount: true,
        guestCount: true,
        guestBreakfast: true,
        guestLunch: true,
        guestDinner: true,
        frozen: true,
      },
    })
  }

  async upsertLog(
    memberId: string,
    messId: string,
    date: string,
    data: Partial<{
      breakfastCount: number
      lunchCount: number
      dinnerCount: number
      guestCount: number
      frozen: boolean
      overrideType: string | null
    }>,
    /** Optional meal defaults used only when CREATING a new log row. */
    mealDefaults?: { breakfastCount: number; lunchCount: number; dinnerCount: number },
  ): Promise<DailyLogRow> {
    const dateObj = this.dateObj(date)
    const base = mealDefaults ?? { breakfastCount: 1, lunchCount: 1, dinnerCount: 1 }
    const defaults = { ...base, guestCount: 0, frozen: false, isOverride: false, overrideType: null }
    return prisma.dailyLog.upsert({
      where: { messId_memberId_logDate: { messId, memberId, logDate: dateObj } },
      create: { memberId, messId, logDate: dateObj, ...defaults, ...data },
      update: data,
      select: {
        id: true,
        breakfastCount: true,
        lunchCount: true,
        dinnerCount: true,
        guestCount: true,
        guestBreakfast: true,
        guestLunch: true,
        guestDinner: true,
        frozen: true,
      },
    })
  }

  async updateLog(id: string, data: Partial<{
    breakfastCount: number
    lunchCount: number
    dinnerCount: number
    guestCount: number
    guestBreakfast: number
    guestLunch: number
    guestDinner: number
    isOverride: boolean
    overrideType: string | null
  }>): Promise<void> {
    await prisma.dailyLog.update({ where: { id }, data })
  }

  /** Bulk upsert for all members — used by /nomeal to set all slot counts to 0. */
  async bulkUpsertLogs(
    memberIds: string[],
    messId: string,
    date: string,
    data: { breakfastCount: number; lunchCount: number; dinnerCount: number },
    overrideType: 'USER' | 'ADMIN' | 'SYSTEM' = 'ADMIN',
  ): Promise<void> {
    const dateObj = this.dateObj(date)
    await Promise.all(
      memberIds.map((memberId) =>
        prisma.dailyLog.upsert({
          where: { messId_memberId_logDate: { messId, memberId, logDate: dateObj } },
          create: {
            memberId,
            messId,
            logDate: dateObj,
            guestCount: 0,
            frozen: false,
            isOverride: true,
            overrideType,
            ...data,
          },
          // A meal nobody eats has no guests either
          update: {
            ...data,
            ...(data.breakfastCount === 0 ? { guestBreakfast: 0 } : {}),
            ...(data.lunchCount === 0 ? { guestLunch: 0 } : {}),
            ...(data.dinnerCount === 0 ? { guestDinner: 0 } : {}),
            isOverride: true,
            overrideType,
          },
        }),
      ),
    )
  }

  /**
   * Bulk restore from per-member preferences — used by /mealon to reset
   * each member back to their own default counts rather than forcing all-1.
   */
  async bulkRestoreFromPrefs(
    memberPrefsMap: Map<string, { breakfastCount: number; lunchCount: number; dinnerCount: number }>,
    messId: string,
    date: string,
  ): Promise<void> {
    const dateObj = this.dateObj(date)
    await Promise.all(
      Array.from(memberPrefsMap.entries()).map(([memberId, prefs]) =>
        prisma.dailyLog.upsert({
          where: { messId_memberId_logDate: { messId, memberId, logDate: dateObj } },
          create: {
            memberId,
            messId,
            logDate: dateObj,
            guestCount: 0,
            frozen: false,
            isOverride: false,
            overrideType: null,
            ...prefs,
          },
          update: { ...prefs, isOverride: false, overrideType: null },
        }),
      ),
    )
  }
}
