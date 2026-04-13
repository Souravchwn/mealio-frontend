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
    const phone = ctx.args[0]
    if (!phone) {
      await this.sender.sendMessage(ctx.chatId, `❌ Usage: \`/link +8801712345678\``)
      return
    }

    const result = await this.linkingService.initiateLink(ctx.telegramUid, phone)
    await this.sender.sendMessage(ctx.chatId, result.message)
  }
}
