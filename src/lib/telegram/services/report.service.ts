/**
 * ReportService — aggregation queries for /rate and /balance commands.
 */

import { monthRange, countMealSlots } from '@/lib/financial'
import type { MealRepository } from '../repositories/meal.repository'
import type { RateResult, BalanceResult } from '../dto'

export class ReportService {
  constructor(private readonly mealRepo: MealRepository) {}

  async getMealRate(messId: string, month: string): Promise<RateResult> {
    const { start, end } = monthRange(month)
    const [expenses, logs] = await Promise.all([
      this.mealRepo.getMonthExpenses(messId, start, end),
      this.mealRepo.getMonthLogs(messId, start, end),
    ])
    const totalExpense = expenses.reduce((s, e) => s + e.amount, 0)
    const totalMeals = countMealSlots(logs)
    const mealRate = totalMeals > 0 ? totalExpense / totalMeals : 0
    return { month, totalExpense, totalMeals, mealRate }
  }

  async getMemberBalance(
    memberId: string,
    memberName: string,
    messId: string,
    month: string,
  ): Promise<BalanceResult> {
    const { start, end } = monthRange(month)
    const [allExpenses, allLogs, memberExpenses, memberLogs] = await Promise.all([
      this.mealRepo.getMonthExpenses(messId, start, end),
      this.mealRepo.getMonthLogs(messId, start, end),
      this.mealRepo.getMemberMonthExpenses(memberId, start, end),
      this.mealRepo.getMemberMonthLogs(memberId, start, end),
    ])
    const totalExpense = allExpenses.reduce((s, e) => s + e.amount, 0)
    const totalMeals = countMealSlots(allLogs)
    const mealRate = totalMeals > 0 ? totalExpense / totalMeals : 0
    const contributed = memberExpenses.reduce((s, e) => s + e.amount, 0)
    const myMeals = countMealSlots(memberLogs)
    const balance = contributed - myMeals * mealRate
    return { memberName, month, contributed, mealCost: myMeals * mealRate, balance }
  }
}
