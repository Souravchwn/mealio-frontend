/**
 * linkGroupToMess — the one place a Telegram group is attached to a mess.
 * Used by the web form (typed chat id) and by the bot's /linkgroup command.
 */

import { prisma } from '@/lib/prisma'
import { createAudit } from '@/lib/audit'
import { getMessSettings, refreshMessSettings } from '@/lib/mess-settings'
import { DEFAULT_TIMEZONE } from '@/lib/constants'
import { GroupRepository } from '../repositories/group.repository'

const groupRepo = new GroupRepository()

export type LinkGroupResult =
  | { ok: true }
  | { ok: false; reason: 'TAKEN' }

export async function linkGroupToMess(input: {
  chatId: string
  chatName: string
  messId: string
  actorId: string
  timezone: string
}): Promise<LinkGroupResult> {
  // A chat already linked to another mess must not be silently taken over
  const existing = await prisma.telegramGroup.findUnique({
    where: { chatId: input.chatId },
    select: { messId: true, isActive: true },
  })
  if (existing && existing.isActive && existing.messId !== input.messId) return { ok: false, reason: 'TAKEN' }

  // One active group per mess
  await prisma.telegramGroup.updateMany({
    where: { messId: input.messId, isActive: true, chatId: { not: input.chatId } },
    data: { isActive: false },
  })
  await groupRepo.register(input.chatId, input.chatName, input.messId, input.timezone)
  await createAudit({
    messId: input.messId,
    actorId: input.actorId,
    action: 'ADMIN_SETTINGS_UPDATE',
    targetTable: 'telegram_groups',
    newValue: { chat_id: input.chatId, chat_name: input.chatName, timezone: input.timezone },
  })
  await refreshMessSettings(input.messId)
  return { ok: true }
}

export type ActivateResult = 'LINKED' | 'ALREADY' | 'TAKEN' | 'NOT_ADMIN'

/**
 * Connect a Telegram group to the mess of the person who asked (sent /mealtill, or added the bot).
 * Only an ADMIN whose own Telegram is linked can do it; the mess comes from their account, never
 * from anything in the chat. A group already connected to another mess is never taken over.
 */
export async function activateGroup(input: {
  chatId: number
  chatTitle: string | undefined
  member: { id: string; messId: string; role: string } | null
}): Promise<{ result: ActivateResult; messName?: string }> {
  const { member } = input
  if (!member || member.role !== 'ADMIN') return { result: 'NOT_ADMIN' }

  const settings = await getMessSettings(member.messId)
  const messName = settings?.name ?? 'your mess'
  const existing = await groupRepo.findByChatId(String(input.chatId))
  if (existing?.messId === member.messId) return { result: 'ALREADY', messName }

  const linked = await linkGroupToMess({
    chatId: String(input.chatId),
    chatName: input.chatTitle ?? 'House group',
    messId: member.messId,
    actorId: member.id,
    timezone: settings?.timezone ?? DEFAULT_TIMEZONE,
  })
  return { result: linked.ok ? 'LINKED' : 'TAKEN', messName }
}
