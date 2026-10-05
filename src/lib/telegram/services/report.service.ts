/**
 * ReportService — /rate and /balance.
 *
 * Uses the same calculatePeriodSummary() as the web app, so the bot always
 * shows the same numbers as My Summary and the Matrix (current open period,
 * guest policy applied, deposits and carry-forward included).
 */

import { calculatePeriodSummary } from '@/lib/financial'
import { resolvePeriod } from '@/lib/period'
import type { RateResult, BalanceResult } from '../dto'

export class ReportService {
  async getMealRate(messId: string): Promise<RateResult> {
    const period = await resolvePeriod(messId, null)
    const summary = await calculatePeriodSummary(messId, period)
    return {
      month: period.yearMonth,
      totalExpense: summary.totalExpense,
      totalMeals: summary.totalMeals,
      mealRate: summary.mealRate,
    }
  }

  async getMemberBalance(memberId: string, memberName: string, messId: string): Promise<BalanceResult> {
    const period = await resolvePeriod(messId, null)
    const summary = await calculatePeriodSummary(messId, period)
    const me = summary.forMember(memberId)
    return {
      memberName,
      month: period.yearMonth,
      contributed: me.contributed,
      mealCost: me.mealCost,
      balance: me.balance,
    }
  }
}
