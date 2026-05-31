import type { CommandHandler } from '../types'
import type { CommandContext } from '../../dto'
import type { TelegramSender } from '../../infrastructure/sender'

export class StartCommandHandler implements CommandHandler {
  constructor(private readonly sender: TelegramSender) {}

  supports(command: string): boolean {
    return command === '/start'
  }

  async handle(ctx: CommandContext): Promise<void> {
    await this.sender.sendMessage(
      ctx.chatId,
      `*Welcome to Mealio Bot!* 🍽\n\nLink your account with your phone number:\n\`/link +8801XXXXXXXXX\`\n\n*Member commands* (after linking):\n• \`/status\` — today's meal status\n• \`/meal on|off\` — all meals on/off\n• \`/meal breakfast|lunch|dinner\` — toggle a slot\n• \`/meal guest N\` — set guest count\n• \`/rate\` — current meal rate\n• \`/balance\` — your balance\n\n*Admin/Manager commands:*\n• \`/nomeal [date] [reason]\` — turn off all meals & notify\n• \`/mealon [date]\` — restore all meals & notify\n• \`/announce <msg>\` — broadcast to all members`,
    )
  }
}
