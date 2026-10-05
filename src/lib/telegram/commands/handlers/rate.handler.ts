import type { CommandHandler } from '../types'
import type { CommandContext } from '../../dto'
import type { ReportService } from '../../services/report.service'
import type { TelegramSender } from '../../infrastructure/sender'
import { CURRENCY_SYMBOL as C } from '@/lib/constants'

export class RateCommandHandler implements CommandHandler {
  constructor(
    private readonly reportService: ReportService,
    private readonly sender: TelegramSender,
  ) {}

  supports(command: string): boolean {
    return command === '/rate'
  }

  async handle(ctx: CommandContext): Promise<void> {
    if (!ctx.member) {
      await this.sender.sendMessage(ctx.chatId, `❌ Account not linked. Send \`/link\` to see how.`)
      return
    }

    const rate = await this.reportService.getMealRate(ctx.member.messId)

    await this.sender.sendMessage(
      ctx.chatId,
      `📊 *Meal Rate — ${rate.month}*\n\nTotal Expense: ${C}${rate.totalExpense.toFixed(2)}\nTotal Meals: ${rate.totalMeals}\nMeal Rate: ${C}${rate.mealRate.toFixed(2)} per meal`,
    )
  }
}
