/**
 * MemberRepository — telegram-scoped member lookups.
 * Keeps all Prisma calls in one place; services never touch prisma directly.
 */

import { prisma } from '@/lib/prisma'
import type { ResolvedMember } from '../dto'

export interface TelegramLinkedMember {
  id: string
  telegramUid: bigint
}

export class MemberRepository {
  async findByTelegramUid(telegramUid: number): Promise<ResolvedMember | null> {
    const m = await prisma.member.findFirst({
      where: { telegramUid: BigInt(telegramUid), isActive: true },
      select: { id: true, messId: true, name: true, role: true },
    })
    if (!m || !m.messId) return null
    return { id: m.id, messId: m.messId, name: m.name, role: m.role }
  }

  async findByPhone(phone: string): Promise<{ id: string; name: string } | null> {
    return prisma.member.findFirst({
      where: { phone, isActive: true },
      select: { id: true, name: true },
    })
  }

  async linkTelegram(memberId: string, telegramUid: number): Promise<void> {
    await prisma.member.update({
      where: { id: memberId },
      data: { telegramUid: BigInt(telegramUid), telegramLinked: true },
    })
  }

  /** All active linked members in a mess — used for broadcasts. */
  async findLinkedByMess(messId: string): Promise<TelegramLinkedMember[]> {
    const rows = await prisma.member.findMany({
      where: { messId, isActive: true, telegramLinked: true, telegramUid: { not: null } },
      select: { id: true, telegramUid: true },
    })
    return rows.filter((r): r is TelegramLinkedMember => r.telegramUid !== null)
  }

  /** All active members in a mess — used for bulk meal upserts. */
  async findAllActiveByMess(messId: string): Promise<{ id: string; telegramUid: bigint | null; telegramLinked: boolean }[]> {
    return prisma.member.findMany({
      where: { messId, isActive: true },
      select: { id: true, telegramUid: true, telegramLinked: true },
    })
  }

  /** @deprecated Use MealConfigRepository.getTargetMeal() for time-based targeting. */
  async getMessCutoff(messId: string): Promise<string> {
    const mess = await prisma.mess.findUnique({
      where: { id: messId },
      select: { cutOffTime: true },
    })
    return mess?.cutOffTime ? mess.cutOffTime.toISOString().slice(11, 16) : '21:00'
  }
}
