/**
 * guests.ts — the one place that knows how guests are stored on a DailyLog.
 *
 * Guests are per meal: guestBreakfast / guestLunch / guestDinner (lunch only, dinner only, both).
 * Older days used a single guestCount meaning "these guests ate every meal the host ate".
 * Both are read the same way everywhere through slotGuests(), so older days bill exactly as before.
 * The first per-meal change on a day converts its old guestCount into the per-meal columns.
 */

export type GuestSlot = 'breakfast' | 'lunch' | 'dinner'
export const GUEST_SLOTS: readonly GuestSlot[] = ['breakfast', 'lunch', 'dinner']

export interface GuestLogData {
  breakfastCount: number
  lunchCount: number
  dinnerCount: number
  /** legacy: guests at every meal the host eats */
  guestCount: number
  guestBreakfast?: number | null
  guestLunch?: number | null
  guestDinner?: number | null
}

const OWN_FIELD = { breakfast: 'breakfastCount', lunch: 'lunchCount', dinner: 'dinnerCount' } as const
export const GUEST_FIELD = { breakfast: 'guestBreakfast', lunch: 'guestLunch', dinner: 'guestDinner' } as const

/** Guests eating one meal of the day. */
export function slotGuests(log: GuestLogData, slot: GuestSlot): number {
  const perMeal = log[GUEST_FIELD[slot]] ?? 0
  const legacy = log.guestCount > 0 && log[OWN_FIELD[slot]] > 0 ? log.guestCount : 0
  return perMeal + legacy
}

/** Guest portions for the whole day. */
export function dayGuestMeals(log: GuestLogData): number {
  return GUEST_SLOTS.reduce((n, s) => n + slotGuests(log, s), 0)
}

/** { breakfast, lunch, dinner } guests for one day */
export function guestsBySlot(log: GuestLogData): Record<GuestSlot, number> {
  return { breakfast: slotGuests(log, 'breakfast'), lunch: slotGuests(log, 'lunch'), dinner: slotGuests(log, 'dinner') }
}

/**
 * Prisma update data that sets one meal's guests, converting an old guestCount
 * into per-meal columns first so the other meals keep what they had.
 */
export function setSlotGuestsData(log: GuestLogData, slot: GuestSlot, count: number) {
  const current = guestsBySlot(log)
  current[slot] = count
  return {
    guestCount: 0,
    guestBreakfast: current.breakfast,
    guestLunch: current.lunch,
    guestDinner: current.dinner,
  }
}

/** Select these with breakfastCount/lunchCount/dinnerCount to read guests */
export const GUEST_SELECT = { guestCount: true, guestBreakfast: true, guestLunch: true, guestDinner: true } as const
