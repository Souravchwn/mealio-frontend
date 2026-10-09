/**
 * today.ts — Server-only. "What is happening today" for one member and for the whole mess.
 * Used by the web API (/api/meals/today, /api/cook/headcount) and the Telegram Mini App
 * (/api/tg/home), so all of them always show the same thing.
 */

import { prisma } from './prisma'
import { getMemberMealDefaults, getDayType } from './meal-preferences'
import { getMessSettings, todayIn, nowHHMMIn, type MessSettings } from './mess-settings'
import { ensureDailyLogs } from './daily-logs'
import type { GuestMealPolicy } from './constants'

const SLOTS = ['BREAKFAST', 'LUNCH', 'DINNER'] as const
type Slot = (typeof SLOTS)[number]
const COUNT_FIELD = { BREAKFAST: 'breakfastCount', LUNCH: 'lunchCount', DINNER: 'dinnerCount' } as const

export interface SlotCutoff { cutoffTime: string; cutoffPassed: boolean }

export interface MemberDayMeals {
  /** null when the day has no log (a past or future day nobody recorded) */
  logId: string | null
  memberId: string
  date: string
  breakfastCount: number
  lunchCount: number
  dinnerCount: number
  guestCount: number
  frozen: boolean
  isOverride: boolean
  /** Next upcoming cutoff, or the dinner cutoff once all have passed */
  cutOffTime: string
  /** True when every slot has passed its cutoff (or the day is frozen) */
  cutOffPassed: boolean
  slotCutoffs: { breakfast: SlotCutoff; lunch: SlotCutoff; dinner: SlotCutoff }
  guestMealPolicy: GuestMealPolicy
  dayType: 'WEEKDAY' | 'WEEKEND'
}

/**
 * One member's meals for a day (today by default). Today's log is created from the member's
 * defaults if missing; other days are never invented. Returns null if the mess does not exist.
 */
export async function getMemberDayMeals(messId: string, memberId: string, date?: string | null): Promise<MemberDayMeals | null> {
  const settings = await getMessSettings(messId)
  if (!settings) return null

  const todayReal = todayIn(settings.timezone)
  const day = date || todayReal
  const dayObj = new Date(`${day}T00:00:00.000Z`)
  const nowHHMM = nowHHMMIn(settings.timezone)
  const isToday = day === todayReal

  const cutoffOf = (slot: Slot) => settings.meals[slot].cutoffTime
  // Only today has cutoffs; past days are never blocked here
  const slotCutoffs = {
    breakfast: { cutoffTime: cutoffOf('BREAKFAST'), cutoffPassed: isToday && nowHHMM >= cutoffOf('BREAKFAST') },
    lunch: { cutoffTime: cutoffOf('LUNCH'), cutoffPassed: isToday && nowHHMM >= cutoffOf('LUNCH') },
    dinner: { cutoffTime: cutoffOf('DINNER'), cutoffPassed: isToday && nowHHMM >= cutoffOf('DINNER') },
  }
  const nextSlot = SLOTS.find((s) => !slotCutoffs[s.toLowerCase() as 'breakfast' | 'lunch' | 'dinner'].cutoffPassed)
  const cutOffTime = nextSlot ? cutoffOf(nextSlot) : cutoffOf('DINNER')
  const allPassed = !nextSlot && isToday
  const dayType = getDayType(day, settings.weekendDays)

  // Make sure today's logs exist for the whole mess (replaces the daily cron)
  if (isToday) await ensureDailyLogs(messId)

  let log = await prisma.dailyLog.findFirst({ where: { memberId, messId, logDate: dayObj } })
  if (!log) {
    if (!isToday) {
      // A past or future day with no log means no meals. Never create phantom rows.
      return {
        logId: null, memberId, date: day, breakfastCount: 0, lunchCount: 0, dinnerCount: 0, guestCount: 0,
        frozen: false, isOverride: false, cutOffTime, cutOffPassed: true, slotCutoffs,
        guestMealPolicy: settings.guestMealPolicy, dayType,
      }
    }
    // Today with no log (for example a guest member): create it from their defaults
    const defaults = await getMemberMealDefaults(memberId, messId, day)
    log = await prisma.dailyLog.upsert({
      where: { messId_memberId_logDate: { messId, memberId, logDate: dayObj } },
      create: {
        memberId, messId, logDate: dayObj,
        breakfastCount: defaults.breakfastCount, lunchCount: defaults.lunchCount, dinnerCount: defaults.dinnerCount,
        guestCount: 0, frozen: false, isOverride: false,
      },
      update: {},
    })
  }

  return {
    logId: log.id,
    memberId: log.memberId,
    date: log.logDate.toISOString().slice(0, 10),
    breakfastCount: log.breakfastCount,
    lunchCount: log.lunchCount,
    dinnerCount: log.dinnerCount,
    guestCount: log.guestCount,
    frozen: log.frozen,
    isOverride: log.isOverride,
    cutOffTime,
    cutOffPassed: log.frozen || allPassed,
    slotCutoffs,
    guestMealPolicy: settings.guestMealPolicy,
    dayType,
  }
}

export interface HeadcountSlot {
  memberCount: number
  guestCount: number
  total: number
  cutoffTime: string
  cutoffPassed: boolean
  members: Array<{ id: string; name: string; count: number; guestCount: number; hasLog: boolean }>
  cookNote: string | null
}

export interface TodayHeadcount {
  messName: string
  date: string
  slots: { breakfast: HeadcountSlot; lunch: HeadcountSlot; dinner: HeadcountSlot }
}

/** Who is eating today, per meal, with names. Returns null if the mess does not exist. */
export async function getTodayHeadcount(messId: string): Promise<TodayHeadcount | null> {
  const settings: MessSettings | null = await getMessSettings(messId)
  if (!settings) return null

  await ensureDailyLogs(messId)

  const today = todayIn(settings.timezone)
  const todayObj = new Date(`${today}T00:00:00.000Z`)
  const nowHHMM = nowHHMMIn(settings.timezone)

  const [members, logs, cookNotes] = await Promise.all([
    prisma.member.findMany({ where: { messId, isActive: true }, select: { id: true, name: true, isGuest: true }, orderBy: { name: 'asc' } }),
    prisma.dailyLog.findMany({
      where: { messId, logDate: todayObj },
      select: { memberId: true, breakfastCount: true, lunchCount: true, dinnerCount: true, guestCount: true },
    }),
    prisma.dailyCookNote
      .findMany({ where: { messId, logDate: todayObj }, select: { slot: true, note: true } })
      .catch(() => [] as { slot: string; note: string | null }[]),
  ])

  const logByMember = new Map(logs.map((l) => [l.memberId, l]))
  // Guest members (temporary residents) only appear when they have a log today
  const people = members.filter((m) => !m.isGuest || logByMember.has(m.id))
  const noteBySlot = new Map(cookNotes.map((n) => [n.slot, n.note ?? null]))

  const build = (slot: Slot): HeadcountSlot => {
    const field = COUNT_FIELD[slot]
    let memberPortions = 0
    let guestPortions = 0
    const detail: HeadcountSlot['members'] = []
    for (const m of people) {
      const log = logByMember.get(m.id)
      // No log = default ON (1 portion); ensureDailyLogs normally creates it
      const count = log ? log[field] : 1
      memberPortions += count
      // Guests only eat this meal if their host is eating it
      const guests = count > 0 && log ? log.guestCount : 0
      guestPortions += guests
      detail.push({ id: m.id, name: m.name, count, guestCount: guests, hasLog: !!log })
    }
    const cutoffTime = settings.meals[slot].cutoffTime
    return {
      memberCount: memberPortions,
      guestCount: guestPortions,
      total: memberPortions + guestPortions,
      cutoffTime,
      cutoffPassed: nowHHMM >= cutoffTime,
      members: detail,
      cookNote: noteBySlot.get(slot) ?? null,
    }
  }

  return { messName: settings.name, date: today, slots: { breakfast: build('BREAKFAST'), lunch: build('LUNCH'), dinner: build('DINNER') } }
}
