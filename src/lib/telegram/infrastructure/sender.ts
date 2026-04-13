/**
 * TelegramSender — infrastructure abstraction over the Telegram Bot API.
 * Business logic NEVER calls fetch() directly; it calls this service.
 */

const TELEGRAM_API = 'https://api.telegram.org'
const BATCH_SIZE = 25 // messages per concurrent batch

export class TelegramSender {
  private readonly botToken: string

  constructor(botToken: string) {
    this.botToken = botToken
  }

  /** Send a single Markdown message. Swallows network errors — never throws. */
  async sendMessage(chatId: number, text: string): Promise<void> {
    try {
      await fetch(`${TELEGRAM_API}/bot${this.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
      })
    } catch (err) {
      console.error(`[TelegramSender] sendMessage to ${chatId} failed:`, err)
    }
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
