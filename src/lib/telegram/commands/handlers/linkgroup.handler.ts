import type { CommandHandler } from '../types'
import type { CommandContext } from '../../dto'
import type { TelegramSender } from '../../infrastructure/sender'
import type { OtpRepository } from '../../repositories/otp.repository'
import type { MiniAppService } from '../../services/mini-app.service'
import { activateGroup, linkGroupToMess } from '../../services/group-link.service'
import { getMessSettings } from '@/lib/mess-settings'
import { checkRateLimit } from '@/lib/rate-limit'

/**
 *  /mealio              Anyone, anywhere: opens their own Mealtill Mini App.
 *                       In a group that is not connected yet, a linked ADMIN sending it connects the group.
 *  /linkgroup <code>    Older way to connect a group with a code from the website. Still works.
 */
export class LinkGroupCommandHandler implements CommandHandler {
  constructor(
    private readonly otpRepo: OtpRepository,
    private readonly sender: TelegramSender,
    private readonly miniApp: MiniAppService,
  ) {}

  supports(command: string): boolean {
    // /mealio is the old name of /mealtill and keeps working
    return command === '/mealtill' || command === '/mealio' || command === '/linkgroup'
  }

  async handle(ctx: CommandContext): Promise<void> {
    if (ctx.command === '/mealtill' || ctx.command === '/mealio') return this.open(ctx)
    return this.linkWithCode(ctx)
  }

  private async open(ctx: CommandContext): Promise<void> {
    if (ctx.message.chat.type === 'private') {
      await this.miniApp.openInPrivate(ctx.chatId)
      return
    }

    // Connected group: everyone just gets the button, and the chat stays tidy
    if (ctx.group) {
      await this.miniApp.promptInGroup(ctx.chatId, ctx.message.message_id)
      return
    }

    // Not connected yet: only a linked admin can connect it
    const limited = !(await checkRateLimit('tg-linkgroup', String(ctx.telegramUid), 8, 60 * 60 * 1000)).allowed
    if (limited) return
    const { result, messName } = await activateGroup({ chatId: ctx.chatId, chatTitle: ctx.message.chat.title, member: ctx.member })
    if (result === 'LINKED' || result === 'ALREADY') {
      await this.sender.deleteMessage(ctx.chatId, ctx.message.message_id)
      await this.miniApp.welcomeAndPin(ctx.chatId, messName ?? 'your mess')
      return
    }
    if (result === 'TAKEN') {
      await this.sender.sendMessage(ctx.chatId, '❌ This group is already connected to another mess.')
      return
    }
    await this.sender.sendMessage(
      ctx.chatId,
      ctx.member
        ? '🔒 This group is not connected to Mealtill yet. Ask your mess *admin* to send `/mealtill` here.'
        : '👋 This group is not connected to Mealtill yet. Your mess *admin* can connect it by sending `/mealtill` here (after linking their Telegram in the Mealtill website).',
    )
  }

  /** `/linkgroup CODE`: the older way, still supported. */
  private async linkWithCode(ctx: CommandContext): Promise<void> {
    const reply = (text: string) => this.sender.sendMessage(ctx.chatId, text)
    if (ctx.message.chat.type === 'private') {
      await reply('👥 Send this inside your *house group*. Easier: just add me to the group, or send `/mealtill` there.')
      return
    }
    if (!ctx.args[0]) {
      await reply('Just send `/mealtill` here.')
      return
    }
    const rate = await checkRateLimit('tg-linkgroup', String(ctx.telegramUid), 8, 60 * 60 * 1000)
    if (!rate.allowed) {
      await reply('⚠️ Too many tries. Please wait a while.')
      return
    }
    if (!ctx.member || ctx.member.role !== 'ADMIN') {
      await reply('🔒 Only a mess *admin* with a linked Telegram account can connect a group.')
      return
    }

    // Only this admin's own code, for this admin's mess, is accepted (and used up)
    const accepted = await this.otpRepo.consumeGroupCode(ctx.args[0], ctx.member.id, ctx.member.messId)
    if (!accepted) {
      await reply('❌ That code is not valid or has expired. Just send `/mealtill` instead.')
      return
    }

    const settings = await getMessSettings(ctx.member.messId)
    const result = await linkGroupToMess({
      chatId: String(ctx.chatId),
      chatName: ctx.message.chat.title ?? 'House group',
      messId: ctx.member.messId,
      actorId: ctx.member.id,
      timezone: settings?.timezone ?? ctx.timezone,
    })
    if (!result.ok) {
      await reply('❌ This group is already connected to another mess.')
      return
    }
    await this.miniApp.welcomeAndPin(ctx.chatId, settings?.name ?? 'your mess')
  }
}
