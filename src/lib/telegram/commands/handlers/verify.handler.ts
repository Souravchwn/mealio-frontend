import type { CommandHandler } from '../types'
import type { CommandContext } from '../../dto'
import type { AccountLinkingService } from '../../services/linking.service'
import type { TelegramSender } from '../../infrastructure/sender'

export class VerifyCommandHandler implements CommandHandler {
  constructor(
    private readonly linkingService: AccountLinkingService,
    private readonly sender: TelegramSender,
  ) {}

  supports(command: string): boolean {
    return command === '/verify'
  }

  async handle(ctx: CommandContext): Promise<void> {
    const otp = ctx.args[0]
    if (!otp) {
      await this.sender.sendMessage(ctx.chatId, `❌ Usage: \`/verify 123456\``)
      return
    }

    const result = await this.linkingService.verifyOtp(ctx.telegramUid, otp)
    await this.sender.sendMessage(ctx.chatId, result.message)
  }
}
