/**
 * mess-create.ts — Server-only. The one place a new mess is created
 * (sign-up "start a new mess" and the in-app "create mess" both use it).
 */

import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { randomCode } from './tokens'
import { DEFAULT_CUTOFF_TIME, DEFAULT_MAX_MEAL_COUNT, DEFAULT_MEAL_CONFIGS } from './constants'

/** "MESS-" + 8 random characters (≈ 10^12 combinations). */
export function generateInviteCode(): string {
  return `MESS-${randomCode(8)}`
}

export async function uniqueInviteCode(db: Prisma.TransactionClient | typeof prisma = prisma): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = generateInviteCode()
    const taken = await db.mess.findFirst({ where: { inviteCode: code }, select: { id: true } })
    if (!taken) return code
  }
  throw new Error('Could not generate a unique invite code')
}

/** Create the mess row plus its default meal configs. Call inside a transaction. */
export async function createMessRecord(
  tx: Prisma.TransactionClient,
  input: { name: string; cutOffTime?: string; budget?: number | null; ownerId?: string | null; weekendDays?: string },
) {
  const inviteCode = await uniqueInviteCode(tx)
  const mess = await tx.mess.create({
    data: {
      name: input.name.trim(),
      inviteCode,
      cutOffTime: new Date(`1970-01-01T${input.cutOffTime || DEFAULT_CUTOFF_TIME}:00.000Z`),
      estimatedMonthlyBudget: input.budget ?? null,
      ownerId: input.ownerId ?? null,
      // Bangladesh weekend for new messes; existing messes keep their setting
      weekendDays: input.weekendDays ?? '5,6',
      isActive: true,
    },
    select: { id: true, name: true, inviteCode: true, cutOffTime: true },
  })
  await tx.mealConfig.createMany({
    data: DEFAULT_MEAL_CONFIGS.map((cfg) => ({
      messId: mess.id,
      mealType: cfg.mealType,
      cutoffTime: new Date(`1970-01-01T${cfg.cutoffTime}:00.000Z`),
      enabled: true,
      maxCount: DEFAULT_MAX_MEAL_COUNT,
    })),
    skipDuplicates: true,
  })
  return mess
}
