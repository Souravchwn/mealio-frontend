/**
 * AnnounceService — admin/manager broadcast of arbitrary messages.
 * Completely separate from meal logic (Single Responsibility).
 */

import type { MemberRepository } from '../repositories/member.repository'
import type { TelegramSender } from '../infrastructure/sender'

export interface AnnounceResult {
  ok: boolean
  message: string
  sent: number
}

export class AnnounceService {
  constructor(
    private readonly memberRepo: MemberRepository,
    private readonly sender: TelegramSender,
  ) {}

  async broadcast(messId: string, announcement: string, senderName: string): Promise<AnnounceResult> {
    const linked = await this.memberRepo.findLinkedByMess(messId)
    const chatIds = linked.map((m) => Number(m.telegramUid))

    const { sent } = await this.sender.sendBulkMessages(
      chatIds,
      `📢 *Announcement from ${senderName}*\n\n${announcement}`,
    )

    return {
      ok: true,
      message: `✅ Announcement sent to *${sent}* of ${chatIds.length} linked members.`,
      sent,
    }
  }
}
