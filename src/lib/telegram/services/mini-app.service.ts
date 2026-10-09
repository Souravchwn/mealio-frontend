/**
 * Mini App entry points in Telegram chats.
 *
 * In a group, Telegram only allows a link button to the bot's Main Mini App (t.me/<bot>?startapp);
 * it opens privately for whoever taps it. In a private chat a real web_app button opens it directly.
 * The group keeps at most ONE prompt from the bot: each new one deletes the previous.
 */

import type { InlineButton, TelegramSender } from '../infrastructure/sender'
import type { GroupRepository } from '../repositories/group.repository'

/** The public https address of the Mini App page, or null when the site is not public (local dev). */
export function miniAppUrl(): string | null {
  const base = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
  try {
    const u = new URL(base)
    if (u.protocol !== 'https:' || ['localhost', '127.0.0.1', '::1'].includes(u.hostname)) return null
  } catch {
    return null
  }
  return `${base}/en/tg`
}

/** Link that opens the Mini App from anywhere, including groups. */
export function miniAppLink(): string | null {
  const bot = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME
  return bot ? `https://t.me/${bot}?startapp=home` : null
}

const OPEN_TEXT = '✨ Open my Mealio'

export class MiniAppService {
  constructor(
    private readonly sender: TelegramSender,
    private readonly groupRepo: GroupRepository,
  ) {}

  /** The button for this kind of chat, or null when the bot username is not configured. */
  private button(chatType: string): InlineButton | null {
    const web = miniAppUrl()
    if (chatType === 'private' && web) return { text: OPEN_TEXT, webAppUrl: web }
    const link = miniAppLink()
    return link ? { text: OPEN_TEXT, url: link } : null
  }

  /** Private chat: one message with a button that opens the Mini App right there. */
  async openInPrivate(chatId: number): Promise<void> {
    const b = this.button('private')
    await this.sender.send(chatId, '🍽 *Your Mealio*\nToday\'s meals, your balance and who is eating today.', b ? [b] : undefined)
  }

  /**
   * Group: post a fresh "Open my Mealio" prompt and remove the previous one, so the chat holds at most
   * one. `commandMessageId` (the /mealio someone typed) is removed too when the bot is allowed to.
   */
  async promptInGroup(chatId: number, commandMessageId?: number): Promise<void> {
    if (commandMessageId) await this.sender.deleteMessage(chatId, commandMessageId)
    const ids = await this.groupRepo.getMessageIds(String(chatId))
    if (ids?.lastPromptMessageId) await this.sender.deleteMessage(chatId, ids.lastPromptMessageId)

    const b = this.button('group')
    const sent = await this.sender.send(
      chatId,
      '🍽 *Mealio* · tap below to see your meals, your balance and who is eating today. Only you will see it.',
      b ? [b] : undefined,
      { silent: true },
    )
    await this.groupRepo.setLastPrompt(String(chatId), sent)
  }

  /**
   * Group just connected, or the bot was just made admin: make sure the welcome message with the button
   * exists (posted once) and try to pin it. Pinning needs admin rights; without them it stays unpinned
   * and gets pinned later, when someone makes the bot an admin. Never posts a second welcome.
   */
  async welcomeAndPin(chatId: number, messName: string): Promise<void> {
    const ids = await this.groupRepo.getMessageIds(String(chatId))
    let welcomeId = ids?.pinnedMessageId ?? null
    if (!welcomeId) {
      const b = this.button('group')
      welcomeId = await this.sender.send(
        chatId,
        `✅ *Mealio is on for ${messName}!*\n\nTap the button any time to see *your* meals, *your* balance and who is eating today. It opens just for you, nobody else sees it.\n\nTip: make me an admin so I can pin this and keep the chat tidy.`,
        b ? [b] : undefined,
      )
      if (!welcomeId) return
      await this.groupRepo.setPinned(String(chatId), welcomeId)
    }
    await this.sender.pinMessage(chatId, welcomeId)
  }
}
