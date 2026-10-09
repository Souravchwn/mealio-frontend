import type { CommandHandler } from '../types'
import type { CommandContext } from '../../dto'
import type { TelegramSender } from '../../infrastructure/sender'
import type { AccountLinkingService } from '../../services/linking.service'
import type { MiniAppService } from '../../services/mini-app.service'

export class StartCommandHandler implements CommandHandler {
  constructor(
    private readonly sender: TelegramSender,
    private readonly linkingService: AccountLinkingService,
    private readonly miniApp: MiniAppService,
  ) {}

  supports(command: string): boolean {
    return command === '/start'
  }

  async handle(ctx: CommandContext): Promise<void> {
    // "Open in Telegram" on the website opens this chat as t.me/<bot>?start=CODE, so linking is one tap.
    // Only in a private chat, where nobody else can see the code.
    const code = ctx.args[0]
    if (code && ctx.message.chat.type === 'private') {
      const result = await this.linkingService.linkWithCode(ctx.telegramUid, code)
      await this.sender.sendMessage(ctx.chatId, result.message)
      if (result.ok) await this.miniApp.openInPrivate(ctx.chatId)
      return
    }

    await this.sender.sendMessage(
      ctx.chatId,
      `*Welcome to Mealio!* 🍽\n\n*Link your account once:* in the Mealio website open *Settings → My Telegram* and tap *Open in Telegram*.\n\n*Then any time:* send \`/mealio\` (here or in your house group) to see your meals, your balance and who is eating today.\n\n*Admin:* add me to your house group. I set myself up.\n\n*More commands*\n• \`/status\`, \`/meal on|off\`, \`/meal guest N\`, \`/rate\`, \`/balance\`\n• Admin: \`/nomeal\`, \`/mealon\`, \`/announce <msg>\``,
    )
  }
}
