import type { CommandHandler } from '../types'
import type { CommandContext } from '../../dto'
import type { MealService } from '../../services/meal.service'
import type { TelegramSender } from '../../infrastructure/sender'

export class StatusCommandHandler implements CommandHandler {
  constructor(
    private readonly mealService: MealService,
    private readonly sender: TelegramSender,
  ) {}

  supports(command: string): boolean {
    return command === '/status'
  }

  async handle(ctx: CommandContext): Promise<void> {
    if (!ctx.member) {
      await this.sender.sendMessage(ctx.chatId, `❌ Account not linked. Use \`/link <phone>\``)
      return
    }
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: ctx.group?.timezone ?? 'Asia/Dhaka',
    }).format(new Date())
    const result = await this.mealService.getStatus(ctx.member.id, ctx.member.messId, today)
    await this.sender.sendMessage(ctx.chatId, result.message)
  }
}
