/**
 * MemberRepository — telegram-scoped member lookups.
 * Keeps all Prisma calls in one place; services never touch prisma directly.
 */

import { prisma } from '@/lib/prisma'
import type { ResolvedMember } from '../dto'
import { DEFAULT_CUTOFF_TIME } from '@/lib/constants'

export interface TelegramLinkedMember {
  id: string
  telegramUid: bigint
}

export class MemberRepository {
  async findByTelegramUid(telegramUid: number): Promise<ResolvedMember | null> {
    const m = await prisma.member.findFirst({
      where: {
        telegramUid: BigInt(telegramUid),
        isActive: true,
        deletedAt: null,
        joinStatus: 'APPROVED',
        // Suspended or deleted messes are locked out of the bot too
        mess: { isActive: true, suspendedAt: null, deletedAt: null },
      },
      select: { id: true, messId: true, name: true, role: true },
    })
    if (!m || !m.messId) return null
    return { id: m.id, messId: m.messId, name: m.name, role: m.role }
  }

  async findActiveById(memberId: string): Promise<{ id: string; name: string } | null> {
    return prisma.member.findFirst({
      where: { id: memberId, isActive: true },
      select: { id: true, name: true },
    })
  }

  /**
   * Link a Telegram user to a member. A Telegram account can belong to only
   * one member, so any previous owner of this Telegram id is unlinked first.
   */
  async linkTelegram(memberId: string, telegramUid: number): Promise<void> {
    const uid = BigInt(telegramUid)
    await prisma.$transaction([
      prisma.member.updateMany({
        where: { telegramUid: uid, id: { not: memberId } },
        data: { telegramUid: null, telegramLinked: false },
      }),
      prisma.member.update({
        where: { id: memberId },
        data: { telegramUid: uid, telegramLinked: true },
      }),
    ])
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
    return mess?.cutOffTime ? mess.cutOffTime.toISOString().slice(11, 16) : DEFAULT_CUTOFF_TIME
  }
}
