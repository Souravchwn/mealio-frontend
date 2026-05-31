/**
 * GroupRepository — manages telegram_groups (chat_id ↔ mess mapping).
 * This is the multi-tenant boundary: every command first resolves its group.
 */

import { prisma } from '@/lib/prisma'
import type { ResolvedGroup } from '../dto'

export class GroupRepository {
  async findByChatId(chatId: string): Promise<ResolvedGroup | null> {
    const group = await prisma.telegramGroup.findUnique({
      where: { chatId },
      select: { id: true, chatId: true, messId: true, timezone: true, isActive: true },
    })
    if (!group || !group.isActive) return null
    return { id: group.id, chatId: group.chatId, messId: group.messId, timezone: group.timezone }
  }

  async register(chatId: string, chatName: string, messId: string, timezone = 'Asia/Dhaka'): Promise<ResolvedGroup> {
    const group = await prisma.telegramGroup.upsert({
      where: { chatId },
      create: { chatId, chatName, messId, timezone },
      update: { chatName, messId, timezone, isActive: true },
      select: { id: true, chatId: true, messId: true, timezone: true },
    })
    return { id: group.id, chatId: group.chatId, messId: group.messId, timezone: group.timezone }
  }

  async deactivate(chatId: string): Promise<void> {
    await prisma.telegramGroup.updateMany({ where: { chatId }, data: { isActive: false } })
  }
}
