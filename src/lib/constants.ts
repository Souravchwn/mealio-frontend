/**
 * Application-wide constants.
 * Import from here — never hardcode these values in routes or services.
 */

export const DEFAULT_CUTOFF_TIME = '21:00' as const
export const DEFAULT_TIMEZONE = 'Asia/Dhaka' as const

/** Canonical meal type values — used in meal_configs and user_meal_preferences. */
export const MEAL_TYPES = ['BREAKFAST', 'LUNCH', 'DINNER'] as const
export type MealTypeUpper = (typeof MEAL_TYPES)[number]

/** Default per-mess meal configs seeded on creation. */
export const DEFAULT_MEAL_CONFIGS: Array<{ mealType: MealTypeUpper; cutoffTime: string }> = [
  { mealType: 'BREAKFAST', cutoffTime: '08:30' },
  { mealType: 'LUNCH',     cutoffTime: '13:00' },
  { mealType: 'DINNER',    cutoffTime: '21:00' },
]

export const VALID_ROLES = ['SYSTEM_ADMIN', 'ADMIN', 'MANAGER', 'MEMBER', 'GUEST'] as const
export type MemberRole = (typeof VALID_ROLES)[number]

/** Lowercase slot names used in API toggle requests. */
export const VALID_MEAL_SLOTS = ['breakfast', 'lunch', 'dinner'] as const
export type MealSlot = (typeof VALID_MEAL_SLOTS)[number]

export const EXPENSE_CATEGORIES = [
  'PROTEIN', 'CARB', 'VEGETABLE', 'SPICE', 'OIL', 'UTILITY', 'OTHER',
] as const
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

/** JWT TTL in seconds (30 days) */
export const JWT_TTL_SECONDS = 30 * 24 * 60 * 60

/** OTP validity in minutes */
export const OTP_TTL_MINUTES = 5

/** Telegram broadcast batch size */
export const TELEGRAM_BATCH_SIZE = 25

/** Rate limiter defaults */
export const RATE_LIMIT_MAX_REQUESTS = 5
export const RATE_LIMIT_WINDOW_MS = 10_000

/** Login brute-force protection: 10 attempts per 15 minutes per IP */
export const LOGIN_MAX_ATTEMPTS = 10
export const LOGIN_WINDOW_MS = 15 * 60 * 1000
