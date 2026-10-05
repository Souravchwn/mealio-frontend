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

/** Roles an admin may assign to a member from the web app. */
export const ASSIGNABLE_ROLES = ['ADMIN', 'MANAGER', 'MEMBER', 'GUEST'] as const

/** Default max portions per member per meal (meal_configs.max_count). */
export const DEFAULT_MAX_MEAL_COUNT = 10

/** Upper bound for guests a member can bring on one day. */
export const MAX_GUEST_COUNT = 20

/**
 * Who pays for guest meals.
 *  HOST   — guest meals are added to the meal count of the member who brought them.
 *  SHARED — guest meals are not counted for anyone; their cost is spread across the mess.
 */
export const GUEST_MEAL_POLICIES = ['HOST', 'SHARED'] as const
export type GuestMealPolicy = (typeof GUEST_MEAL_POLICIES)[number]
export const DEFAULT_GUEST_MEAL_POLICY: GuestMealPolicy = 'HOST'

/**
 * Default weekend days (JS weekday numbers, 0 = Sunday … 6 = Saturday).
 * Each mess can change this in Settings — e.g. Friday + Saturday = [5, 6].
 */
export const DEFAULT_WEEKEND_DAYS: readonly number[] = [0, 6]

/** Currency symbol used in server-generated text (Telegram, ledger notes). */
export const CURRENCY_SYMBOL = '৳'

/** Telegram link code validity in minutes */
export const TELEGRAM_LINK_CODE_TTL_MINUTES = 10

/** Lowercase slot names used in API toggle requests. */
export const VALID_MEAL_SLOTS = ['breakfast', 'lunch', 'dinner'] as const
export type MealSlot = (typeof VALID_MEAL_SLOTS)[number]

export const EXPENSE_CATEGORIES = [
  'PROTEIN', 'CARB', 'VEGETABLE', 'SPICE', 'OIL', 'UTILITY', 'OTHER',
] as const
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

/** JWT TTL in seconds (30 days) */
export const JWT_TTL_SECONDS = 30 * 24 * 60 * 60

/** Telegram broadcast batch size */
export const TELEGRAM_BATCH_SIZE = 25

/** Rate limiter defaults */
export const RATE_LIMIT_MAX_REQUESTS = 5
export const RATE_LIMIT_WINDOW_MS = 10_000

/** Login brute-force protection: 10 attempts per 15 minutes per IP */
export const LOGIN_MAX_ATTEMPTS = 10
export const LOGIN_WINDOW_MS = 15 * 60 * 1000
