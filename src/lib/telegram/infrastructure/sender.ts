/**
 * TelegramSender — infrastructure abstraction over the Telegram Bot API.
 * Business logic NEVER calls fetch() directly; it calls this service.
 * Every method swallows errors and never throws: a failed Telegram call must not break a webhook.
 */

const TELEGRAM_API = 'https://api.telegram.org'
const BATCH_SIZE = 25 // messages per concurrent batch

/** One inline button: a link (url) or, in private chats only, a Mini App (webAppUrl). */
export type InlineButton = { text: string; url: string } | { text: string; webAppUrl: string }

export class TelegramSender {
  private readonly botToken: string

  constructor(botToken: string) {
    this.botToken = botToken
  }

  private async call<T = unknown>(method: string, body: unknown): Promise<{ ok: boolean; result?: T; description?: string }> {
    try {
      const res = await fetch(`${TELEGRAM_API}/bot${this.botToken}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      return (await res.json()) as { ok: boolean; result?: T; description?: string }
    } catch (err) {
      console.error(`[TelegramSender] ${method} failed:`, err)
      return { ok: false }
    }
  }

  /** Send a Markdown message, optionally with one row of buttons. Returns the message id, or null. */
  async send(chatId: number, text: string, buttons?: InlineButton[], opts?: { silent?: boolean }): Promise<number | null> {
    const reply_markup = buttons?.length
      ? {
          inline_keyboard: [
            buttons.map((b) => ('webAppUrl' in b ? { text: b.text, web_app: { url: b.webAppUrl } } : { text: b.text, url: b.url })),
          ],
        }
      : undefined
    const r = await this.call<{ message_id: number }>('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      reply_markup,
      disable_notification: opts?.silent ?? false,
      link_preview_options: { is_disabled: true },
    })
    return r.ok && r.result ? r.result.message_id : null
  }

  /** Send a single Markdown message. Swallows network errors — never throws. */
  async sendMessage(chatId: number, text: string): Promise<void> {
    await this.send(chatId, text)
  }

  /** Delete a message. Needs the bot to be a group admin for other people's messages; failures are ignored. */
  async deleteMessage(chatId: number, messageId: number): Promise<boolean> {
    return (await this.call('deleteMessage', { chat_id: chatId, message_id: messageId })).ok
  }

  /** Pin a message without a notification. Needs admin rights; failures are ignored. */
  async pinMessage(chatId: number, messageId: number): Promise<boolean> {
    return (await this.call('pinChatMessage', { chat_id: chatId, message_id: messageId, disable_notification: true })).ok
  }

  /**
   * Broadcast a message to many recipients.
   * Processes BATCH_SIZE recipients concurrently, then the next batch.
   * Uses Promise.allSettled so one failure doesn't abort the rest.
   * Returns { sent, failed } counts.
   */
  async sendBulkMessages(
    chatIds: number[],
    text: string,
  ): Promise<{ sent: number; failed: number }> {
    let sent = 0
    let failed = 0

    for (let i = 0; i < chatIds.length; i += BATCH_SIZE) {
      const batch = chatIds.slice(i, i + BATCH_SIZE)
      const results = await Promise.allSettled(
        batch.map((id) => this.sendMessage(id, text)),
      )
      for (const r of results) {
        if (r.status === 'fulfilled') sent++
        else failed++
      }
    }

    return { sent, failed }
  }
}

/** Singleton — constructed once per process, reused across invocations. */
let _sender: TelegramSender | null = null

export function getTelegramSender(): TelegramSender {
  if (!_sender) {
    const token = process.env.TELEGRAM_BOT_TOKEN
    if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set')
    _sender = new TelegramSender(token)
  }
  return _sender
}
