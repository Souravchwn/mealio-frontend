/**
 * activity.ts — Server-only usage tracking for the staff console.
 *
 * Records that a member used ManagerBabu on a given day through a given channel.
 * It stores no content, only (member, mess, day, source). The console turns these
 * rows into active messes, weekly active people and retention.
 *
 * Writes are fire-and-forget and throttled in memory: one DB write per member,
 * per channel, per hour at most. A failed write never breaks the request.
 */

import { prisma } from './prisma'
import { DEFAULT_TIMEZONE } from './constants'
import { todayIn } from './mess-settings'

export type ActivitySource = 'WEB' | 'TELEGRAM' | 'MINI_APP'

const HOUR = 60 * 60 * 1000
const MAX_CACHE = 20_000

/** key = member:mess:source → { day, at } of the last write from this process */
const lastWrite = new Map<string, { day: string; at: number }>()

/** The calendar day the platform counts activity in (Asia/Dhaka by default). */
export function activityDay(): string {
  return todayIn(DEFAULT_TIMEZONE)
}

export function recordActivity(memberId: string, messId: string, source: ActivitySource): void {
  const key = `${memberId}:${messId}:${source}`
  const day = activityDay()
  const now = Date.now()
  const prev = lastWrite.get(key)
  if (prev && prev.day === day && now - prev.at < HOUR) return

  if (lastWrite.size >= MAX_CACHE) lastWrite.clear()
  lastWrite.set(key, { day, at: now })

  const dayDate = new Date(`${day}T00:00:00.000Z`)
  Promise.all([
    prisma.memberActivity.createMany({
      data: [{ memberId, messId, day: dayDate, source }],
      skipDuplicates: true,
    }),
    prisma.member.update({ where: { id: memberId }, data: { lastSeenAt: new Date(now) } }),
  ]).catch((err) => {
    // Let the next request try again
    lastWrite.delete(key)
    console.error('[activity] could not record activity', err)
  })
}
