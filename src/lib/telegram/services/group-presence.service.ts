/**
 * The bot was added to, removed from, or promoted in a chat (`my_chat_member` update).
 *
 *  Added to a group by a linked ADMIN  → connect the group to their mess, post the welcome, try to pin it
 *  Added by anyone else                → one short note, nothing else
 *  Made an admin later                 → pin the welcome (it could not be pinned before)
 *  Removed / kicked                    → stop using the group
 *
 * Telegram tells us who added the bot, and the webhook secret stops forged updates, so the adder's
 * identity is trustworthy. Their mess comes from their linked account, never from the chat.
 */

import type { TelegramChatMemberUpdated, TelegramMemberStatus } from '../dto'
import type { TelegramSender } from '../infrastructure/sender'
import type { GroupRepository } from '../repositories/group.repository'
import type { MemberRepository } from '../repositories/member.repository'
import type { MiniAppService } from './mini-app.service'
import { activateGroup } from './group-link.service'
import { getMessSettings } from '@/lib/mess-settings'

const PRESENT: TelegramMemberStatus[] = ['creator', 'administrator', 'member', 'restricted']

export class GroupPresenceService {
  constructor(
    private readonly sender: TelegramSender,
    private readonly memberRepo: MemberRepository,
    private readonly groupRepo: GroupRepository,
    private readonly miniApp: MiniAppService,
  ) {}

  async handle(change: TelegramChatMemberUpdated): Promise<void> {
    const { chat } = change
    if (chat.type !== 'group' && chat.type !== 'supergroup') return

    const wasIn = PRESENT.includes(change.old_chat_member.status)
    const isIn = PRESENT.includes(change.new_chat_member.status)

    // Removed or kicked: stop using this chat
    if (wasIn && !isIn) {
      await this.groupRepo.deactivate(String(chat.id))
      return
    }

    // Promoted to admin: now the welcome can be pinned
    if (wasIn && isIn) {
      const promoted = change.new_chat_member.status === 'administrator' && change.old_chat_member.status !== 'administrator'
      if (!promoted) return
      const group = await this.groupRepo.findByChatId(String(chat.id))
      if (!group) return
      const settings = await getMessSettings(group.messId)
      await this.miniApp.welcomeAndPin(chat.id, settings?.name ?? 'your mess')
      return
    }

    if (!isIn) return

    // Just added
    const adder = await this.memberRepo.findByTelegramUid(change.from.id)
    const { result, messName } = await activateGroup({ chatId: chat.id, chatTitle: chat.title, member: adder })
    if (result === 'LINKED' || result === 'ALREADY') {
      await this.miniApp.welcomeAndPin(chat.id, messName ?? 'your mess')
      return
    }
    if (result === 'TAKEN') {
      await this.sender.sendMessage(chat.id, '❌ This group is already connected to another mess.')
      return
    }
    await this.sender.sendMessage(
      chat.id,
      '👋 Hi! I am Mealtill. Your mess *admin* can switch me on by sending `/mealtill` here (after linking their Telegram in the Mealtill website).',
    )
  }
}
