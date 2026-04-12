import type { CommandHandler } from '../types'
import type { CommandContext } from '../../dto'
import type { ReportService } from '../../services/report.service'
import type { TelegramSender } from '../../infrastructure/sender'

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
      await this.sender.sendMessage(ctx.chatId, `❌ Account not linked. Use \`/link <phone>\``)
      return
    }

    const month = new Intl.DateTimeFormat('en-CA', {
      timeZone: ctx.group?.timezone ?? 'Asia/Dhaka',
      year: 'numeric',
      month: '2-digit',
    }).format(new Date()).slice(0, 7)

    const rate = await this.reportService.getMealRate(ctx.member.messId, month)

    await this.sender.sendMessage(
      ctx.chatId,
      `📊 *Meal Rate — ${rate.month}*\n\nTotal Expense: ৳${rate.totalExpense.toFixed(2)}\nTotal Meals: ${rate.totalMeals}\nMeal Rate: ৳${rate.mealRate.toFixed(2)} per meal`,
    )
  }
}
