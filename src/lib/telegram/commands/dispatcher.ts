/**
 * CommandDispatcher — routes incoming Telegram messages to the correct handler.
 *
 * Design:
 * 1. Pre-resolves member and group from the DB before dispatching (done once).
 * 2. Iterates the registered handler list; first matching `supports()` wins.
 * 3. Unknown commands get a friendly fallback.
 * 4. No if-else chains — adding a command = registering a new handler.
 */

import type { TelegramUpdate, CommandContext } from '../dto'
import type { CommandHandler } from './types'
import type { TelegramSender } from '../infrastructure/sender'
import type { MemberRepository } from '../repositories/member.repository'
import type { GroupRepository } from '../repositories/group.repository'

export class CommandDispatcher {
  private readonly handlers: CommandHandler[]

  constructor(
    handlers: CommandHandler[],
    private readonly sender: TelegramSender,
    private readonly memberRepo: MemberRepository,
    private readonly groupRepo: GroupRepository,
  ) {
    this.handlers = handlers
  }

  async dispatch(update: TelegramUpdate): Promise<void> {
    const message = update.message
    if (!message?.text || !message.from) return

    const text = message.text.trim()
    const command = parseCommand(text)
    if (!command) return // not a command

    const chatId = message.chat.id
    const telegramUid = message.from.id

    // Pre-resolve member and group (single round-trip each, cached per request)
    const [member, group] = await Promise.all([
      this.memberRepo.findByTelegramUid(telegramUid),
      this.groupRepo.findByChatId(String(chatId)),
    ])

    const args = text.split(/\s+/).slice(1) // everything after /command

    const ctx: CommandContext = {
      update,
      message,
      chatId,
      telegramUid,
      command,
      args,
      member,
      group,
    }

    const handler = this.handlers.find((h) => h.supports(command))
    if (handler) {
      await handler.handle(ctx)
    } else {
      await this.sender.sendMessage(
        chatId,
        `❓ Unknown command: \`${command}\`\n\nSend \`/start\` to see available commands.`,
      )
    }
  }
}

/**
 * Extracts the command word from a message.
 * Handles bot-suffixed commands (e.g. /start@MealioBot → /start).
 * Returns null for non-command messages.
 */
function parseCommand(text: string): string | null {
  if (!text.startsWith('/')) return null
  const word = text.split(/\s+/)[0]
  // Strip @BotName suffix if present
  return word.split('@')[0].toLowerCase()
}
