import type { CommandHandler } from '../types'
import type { CommandContext } from '../../dto'
import type { AnnounceService } from '../../services/announce.service'
import type { TelegramSender } from '../../infrastructure/sender'
import { checkRateLimit } from '@/lib/rate-limit'

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

    if (announcement.length > 1000) {
      await this.sender.sendMessage(ctx.chatId, `❌ Keep announcements under 1000 characters.`)
      return
    }
    // At most 10 broadcasts per mess per day, so nobody spams the whole mess
    const quota = await checkRateLimit('announce', ctx.member.messId, 10, 24 * 60 * 60 * 1000)
    if (!quota.allowed) {
      await this.sender.sendMessage(ctx.chatId, `⏳ Your mess has sent 10 announcements today. Try again tomorrow.`)
      return
    }

    const result = await this.announceService.broadcast(
      ctx.member.messId, announcement, ctx.member.name,
    )
    await this.sender.sendMessage(ctx.chatId, result.message)
  }
}
