import type { CommandHandler } from '../types'
import type { CommandContext } from '../../dto'
import type { AccountLinkingService } from '../../services/linking.service'
import type { TelegramSender } from '../../infrastructure/sender'

export class LinkCommandHandler implements CommandHandler {
  constructor(
    private readonly linkingService: AccountLinkingService,
    private readonly sender: TelegramSender,
  ) {}

  supports(command: string): boolean {
    return command === '/link'
  }

  async handle(ctx: CommandContext): Promise<void> {
    const code = ctx.args[0]
    if (!code) {
      await this.sender.sendMessage(
        ctx.chatId,
        `🔗 *Link your account*\n\n1. Open the Mealtill web app → *Settings → Telegram*\n2. Tap *Get link code*\n3. Send it here: \`/link ABCD2345\`\n\n_Send the code in a private chat with the bot._`,
      )
      return
    }

    const result = await this.linkingService.linkWithCode(ctx.telegramUid, code)
    await this.sender.sendMessage(ctx.chatId, result.message)
  }
}
