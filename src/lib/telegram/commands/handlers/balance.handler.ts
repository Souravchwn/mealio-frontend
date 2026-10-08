import type { CommandHandler } from '../types'
import type { CommandContext } from '../../dto'
import type { ReportService } from '../../services/report.service'
import type { TelegramSender } from '../../infrastructure/sender'
import { CURRENCY_SYMBOL as C } from '@/lib/constants'

export class BalanceCommandHandler implements CommandHandler {
  constructor(
    private readonly reportService: ReportService,
    private readonly sender: TelegramSender,
  ) {}

  supports(command: string): boolean {
    return command === '/balance'
  }

  async handle(ctx: CommandContext): Promise<void> {
    if (!ctx.member) {
      await this.sender.sendMessage(ctx.chatId, `❌ Account not linked. Send \`/link\` to see how.`)
      return
    }
    if (ctx.member.role === 'GUEST') {
      await this.sender.sendMessage(ctx.chatId, `❌ Balance is not available for guest accounts.`)
      return
    }

    const bal = await this.reportService.getMemberBalance(ctx.member.id, ctx.member.name, ctx.member.messId)

    const sign = bal.balance >= 0 ? '+' : ''
    await this.sender.sendMessage(
      ctx.chatId,
      `💰 *Balance · ${bal.month}*\n\nContributed: ${C}${bal.contributed.toFixed(2)}\nMeal Cost: ${C}${bal.mealCost.toFixed(2)}\nBalance: ${sign}${C}${bal.balance.toFixed(2)}\n\n${bal.balance >= 0 ? '✅ You are ahead' : '⚠️ You owe the mess'}`,
    )
  }
}
