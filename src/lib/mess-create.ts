/**
 * mess-create.ts — Server-only. The one place a new mess is created
 * (sign-up "start a new mess" and the in-app "create mess" both use it).
 */

import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { randomCode } from './tokens'
import { DEFAULT_CUTOFF_TIME, DEFAULT_MAX_MEAL_COUNT, DEFAULT_MEAL_CONFIGS, DEFAULT_TIMEZONE } from './constants'
import { isValidTimezone } from './mess-settings'

/** Places whose weekend is Friday and Saturday. Everywhere else starts on Saturday and Sunday. */
const FRIDAY_SATURDAY_ZONES = new Set([
  'Asia/Dhaka', 'Asia/Riyadh', 'Asia/Qatar', 'Asia/Kuwait', 'Asia/Bahrain', 'Asia/Muscat',
  'Asia/Baghdad', 'Asia/Amman', 'Asia/Aden', 'Asia/Jerusalem', 'Africa/Cairo', 'Africa/Algiers',
  'Africa/Khartoum', 'Africa/Tripoli',
])

/** The timezone a new mess starts with: the creator's own when it is a real one. */
export function startingTimezone(fromBrowser: unknown): string {
  return typeof fromBrowser === 'string' && fromBrowser && isValidTimezone(fromBrowser) ? fromBrowser : DEFAULT_TIMEZONE
}

/** JS weekday numbers (0 = Sun ... 6 = Sat) of the usual weekend in that timezone. */
export function weekendFor(timezone: string): string {
  return FRIDAY_SATURDAY_ZONES.has(timezone) ? '5,6' : '6,0'
}

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
  input: { name: string; cutOffTime?: string; budget?: number | null; ownerId?: string | null; weekendDays?: string; timezone?: string },
) {
  const inviteCode = await uniqueInviteCode(tx)
  const mess = await tx.mess.create({
    data: {
      name: input.name.trim(),
      inviteCode,
      cutOffTime: new Date(`1970-01-01T${input.cutOffTime || DEFAULT_CUTOFF_TIME}:00.000Z`),
      estimatedMonthlyBudget: input.budget ?? null,
      ownerId: input.ownerId ?? null,
      // The creator's timezone and its usual weekend; both can be changed in Settings
      timezone: input.timezone ?? DEFAULT_TIMEZONE,
      weekendDays: input.weekendDays ?? weekendFor(input.timezone ?? DEFAULT_TIMEZONE),
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
