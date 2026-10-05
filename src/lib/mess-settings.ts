/**
 * mess-settings.ts — Server-only. Single source of truth for per-mess settings.
 *
 * Postgres is the durable store; Redis serves every read. All API routes and
 * the Telegram bot should call `getMessSettings()` instead of querying
 * messes / meal_configs / telegram_groups for configuration.
 *
 * After ANY write that changes a setting (mess row, meal_configs, telegram
 * group timezone), call `refreshMessSettings(messId)` so Redis is updated.
 */

import { prisma } from './prisma'
import { redisGet, redisSet } from './redis'
import {
  DEFAULT_CUTOFF_TIME,
  DEFAULT_GUEST_MEAL_POLICY,
  DEFAULT_MAX_MEAL_COUNT,
  DEFAULT_MEAL_CONFIGS,
  DEFAULT_TIMEZONE,
  DEFAULT_WEEKEND_DAYS,
  GUEST_MEAL_POLICIES,
  MEAL_TYPES,
  type GuestMealPolicy,
  type MealTypeUpper,
} from './constants'

export interface MealSlotSettings {
  enabled: boolean
  /** HH:MM in the mess timezone */
  cutoffTime: string
  maxCount: number
}

export interface MessSettings {
  messId: string
  name: string
  timezone: string
  /** Legacy single cutoff (HH:MM) */
  cutOffTime: string
  monthStartDay: number
  estimatedMonthlyBudget: number | null
  guestMealPolicy: GuestMealPolicy
  bazaarCountsAsDeposit: boolean
  /** Carry member balances into the next month when a month is closed */
  carryForwardBalance: boolean
  /** JS weekday numbers treated as WEEKEND for meal preferences */
  weekendDays: number[]
  meals: Record<MealTypeUpper, MealSlotSettings>
}

/** Bump the version suffix whenever the MessSettings shape changes. */
const key = (messId: string) => `mealio:mess:${messId}:settings:v3`
/** Long TTL — the cache is refreshed on every write; the TTL only self-heals stray drift. */
const TTL_SECONDS = 24 * 60 * 60

/** "5,6" → [5, 6]; invalid input falls back to the default weekend. */
export function parseWeekendDays(raw: string | null | undefined): number[] {
  const days = (raw ?? '')
    .split(',')
    .map((d) => Number(d.trim()))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
  return days.length > 0 ? Array.from(new Set(days)).sort() : [...DEFAULT_WEEKEND_DAYS]
}

function toHHMM(t: Date): string {
  return t.toISOString().slice(11, 16)
}

async function loadFromDb(messId: string): Promise<MessSettings | null> {
  const mess = await prisma.mess.findUnique({
    where: { id: messId },
    select: {
      id: true,
      name: true,
      cutOffTime: true,
      monthStartDay: true,
      estimatedMonthlyBudget: true,
      guestMealPolicy: true,
      bazaarCountsAsDeposit: true,
      carryForwardBalance: true,
      weekendDays: true,
      telegramGroups: { where: { isActive: true }, select: { timezone: true }, take: 1 },
      mealConfigs: { select: { mealType: true, enabled: true, cutoffTime: true, maxCount: true } },
    },
  })
  if (!mess) return null

  const legacyCutoff = mess.cutOffTime ? toHHMM(mess.cutOffTime) : DEFAULT_CUTOFF_TIME
  const meals = {} as Record<MealTypeUpper, MealSlotSettings>
  for (const d of DEFAULT_MEAL_CONFIGS) {
    meals[d.mealType] = {
      enabled: true,
      cutoffTime: d.mealType === 'DINNER' ? legacyCutoff : d.cutoffTime,
      maxCount: DEFAULT_MAX_MEAL_COUNT,
    }
  }
  for (const c of mess.mealConfigs) {
    if (!MEAL_TYPES.includes(c.mealType as MealTypeUpper)) continue
    meals[c.mealType as MealTypeUpper] = {
      enabled: c.enabled,
      cutoffTime: toHHMM(c.cutoffTime),
      maxCount: c.maxCount,
    }
  }

  const policy = GUEST_MEAL_POLICIES.includes(mess.guestMealPolicy as GuestMealPolicy)
    ? (mess.guestMealPolicy as GuestMealPolicy)
    : DEFAULT_GUEST_MEAL_POLICY

  return {
    messId: mess.id,
    name: mess.name,
    timezone: mess.telegramGroups[0]?.timezone ?? DEFAULT_TIMEZONE,
    cutOffTime: legacyCutoff,
    monthStartDay: mess.monthStartDay ?? 1,
    estimatedMonthlyBudget: mess.estimatedMonthlyBudget ? Number(mess.estimatedMonthlyBudget) : null,
    guestMealPolicy: policy,
    bazaarCountsAsDeposit: mess.bazaarCountsAsDeposit,
    carryForwardBalance: mess.carryForwardBalance,
    weekendDays: parseWeekendDays(mess.weekendDays),
    meals,
  }
}

/** Read settings — Redis first, Postgres on miss (and repopulate Redis). */
export async function getMessSettings(messId: string): Promise<MessSettings | null> {
  const cached = await redisGet<MessSettings>(key(messId))
  if (cached) return cached
  return refreshMessSettings(messId)
}

/** Like getMessSettings but throws when the mess does not exist. */
export async function requireMessSettings(messId: string): Promise<MessSettings> {
  const settings = await getMessSettings(messId)
  if (!settings) throw new Error(`Mess ${messId} not found`)
  return settings
}

/** Reload from Postgres and write through to Redis. Call after every settings write. */
export async function refreshMessSettings(messId: string): Promise<MessSettings | null> {
  const fresh = await loadFromDb(messId)
  if (fresh) await redisSet(key(messId), fresh, TTL_SECONDS)
  return fresh
}

// ─── Time helpers bound to a mess timezone ────────────────────────────────────

/** Today's date (YYYY-MM-DD) in the given timezone. */
export function todayIn(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date())
}

/** Current time (HH:MM, 24h) in the given timezone. */
export function nowHHMMIn(timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone,
  }).format(new Date())
}

/** True when the string is an IANA timezone the runtime understands. */
export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}
