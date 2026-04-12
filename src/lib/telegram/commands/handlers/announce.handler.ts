import type { CommandHandler } from '../types'
import type { CommandContext } from '../../dto'
import type { AnnounceService } from '../../services/announce.service'
import type { TelegramSender } from '../../infrastructure/sender'

export class AnnounceCommandHandler implements CommandHandler {
  constructor(
    private readonly announceService: AnnounceService,
    private readonly sender: TelegramSender,
  ) {}

  supports(command: string): boolean {
    return command === '/announce'
  }

  async handle(ctx: CommandContext): Promise<void> {
    if (!ctx.member) {
      await this.sender.sendMessage(ctx.chatId, `❌ Account not linked.`)
      return
    }
    if (ctx.member.role !== 'ADMIN' && ctx.member.role !== 'MANAGER') {
      await this.sender.sendMessage(ctx.chatId, `❌ Only admins and managers can broadcast.`)
      return
    }

    const announcement = ctx.args.join(' ').trim()
    if (!announcement) {
      await this.sender.sendMessage(
        ctx.chatId,
        `❌ Usage: \`/announce Your message here\`\n\nExample:\n\`/announce Bazar done, all 3 meals confirmed!\``,
      )
      return
    }

    const result = await this.announceService.broadcast(
      ctx.member.messId, announcement, ctx.member.name,
    )
    await this.sender.sendMessage(ctx.chatId, result.message)
  }
}
