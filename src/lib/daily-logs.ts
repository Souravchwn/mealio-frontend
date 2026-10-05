/**
 * daily-logs.ts — Server-only. On-demand replacement for the old cron jobs.
 *
 * `ensureDailyLogs(messId)` does what `cron/generate-daily-meals` and
 * `cron/deactivate-guests` used to do, lazily, the first time anything reads
 * the mess's meal data on a given day:
 *   1. Deactivates guest members whose guest_until has passed.
 *   2. Creates missing DailyLog rows (from each member's preferences) for every
 *      day of the open period up to today, starting no earlier than the day
 *      the member joined.
 *
 * Idempotent (createMany + skipDuplicates). A Redis marker makes repeat calls
 * on the same day a single GET; without Redis it simply runs each time.
 */

import { prisma } from './prisma'
import { getRedis, redisDel, redisGet, redisSet } from './redis'
import { getBulkMealDefaults, getDayType, type MealDefaults, type DayType } from './meal-preferences'
import { getCurrentPeriod } from './period'
import { requireMessSettings, todayIn } from './mess-settings'

const markerKey = (messId: string, date: string) => `mealio:mess:${messId}:logs-ensured:${date}`
const MARKER_TTL_SECONDS = 26 * 60 * 60

const DAY_MS = 24 * 60 * 60 * 1000

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Housekeeping that used to need a scheduled job: purge processed Telegram
 * update ids (> 30 days) and spent/expired link codes (> 1 day).
 * Runs at most once a day across all instances (Redis SET NX); without Redis
 * it runs on ~1% of calls instead.
 */
async function purgeOldRecordsOncePerDay(): Promise<void> {
  const redis = getRedis()
  if (redis) {
    const day = new Date().toISOString().slice(0, 10)
    const first = await redis.set(`mealio:cleanup:${day}`, 1, { nx: true, ex: MARKER_TTL_SECONDS }).catch(() => null)
    if (!first) return
  } else if (Math.random() > 0.01) {
    return
  }

  const now = Date.now()
  await Promise.all([
    prisma.processedUpdate.deleteMany({ where: { processedAt: { lt: new Date(now - 30 * DAY_MS) } } }),
    prisma.telegramOtp.deleteMany({
      where: { OR: [{ used: true }, { expiresAt: { lt: new Date(now) } }], createdAt: { lt: new Date(now - DAY_MS) } },
    }),
  ])
}

async function deactivateExpiredGuests(messId: string, today: string): Promise<void> {
  const todayObj = new Date(`${today}T00:00:00.000Z`)
  const expired = await prisma.member.findMany({
    where: { messId, isGuest: true, isActive: true, guestUntil: { lt: todayObj } },
    select: { id: true, name: true, guestUntil: true },
  })
  if (expired.length === 0) return

  await prisma.$transaction([
    prisma.member.updateMany({ where: { id: { in: expired.map((g) => g.id) } }, data: { isActive: false } }),
    prisma.auditLog.createMany({
      data: expired.map((g) => ({
        messId,
        actorId: null,
        action: 'AUTO_DEACTIVATE_GUEST',
        targetTable: 'members',
        targetId: g.id,
        newValue: { reason: `Guest period ended: ${g.guestUntil?.toISOString().slice(0, 10)}`, name: g.name },
      })),
    }),
  ])
}

export async function ensureDailyLogs(messId: string): Promise<void> {
  try {
    const settings = await requireMessSettings(messId)
    const today = todayIn(settings.timezone)
    if (await redisGet<number>(markerKey(messId, today))) return

    await purgeOldRecordsOncePerDay().catch((err) => console.error('[ensureDailyLogs] cleanup failed', err))

    const period = await getCurrentPeriod(messId)
    if (period) {
      const todayObj = new Date(`${today}T00:00:00.000Z`)
      const rangeEnd = period.endDate < todayObj ? period.endDate : todayObj

      if (period.startDate <= rangeEnd) {
        // Regular members AND guest residents (counted only inside their stay dates)
        const members = await prisma.member.findMany({
          where: { messId, isActive: true },
          select: { id: true, joinedAt: true, isGuest: true, guestFrom: true, guestUntil: true },
        })

        if (members.length > 0) {
          const existing = await prisma.dailyLog.findMany({
            where: { messId, logDate: { gte: period.startDate, lte: rangeEnd } },
            select: { memberId: true, logDate: true },
          })
          const have = new Set(existing.map((l) => `${l.memberId}|${isoDate(l.logDate)}`))

          // Preferences differ only by WEEKDAY/WEEKEND — load each set at most once.
          const memberIds = members.map((m) => m.id)
          const prefsByDayType = new Map<DayType, Map<string, MealDefaults>>()
          const prefsFor = async (date: string) => {
            const dayType = getDayType(date, settings.weekendDays)
            let map = prefsByDayType.get(dayType)
            if (!map) {
              map = await getBulkMealDefaults(memberIds, messId, date)
              prefsByDayType.set(dayType, map)
            }
            return map
          }

          const rows = []
          for (let t = period.startDate.getTime(); t <= rangeEnd.getTime(); t += DAY_MS) {
            const day = new Date(t)
            const date = isoDate(day)
            for (const m of members) {
              if (isoDate(m.joinedAt) > date) continue // not a member yet that day
              if (m.isGuest) {
                if (m.guestFrom && isoDate(m.guestFrom) > date) continue // stay not started
                if (m.guestUntil && isoDate(m.guestUntil) < date) continue // stay over
              }
              if (have.has(`${m.id}|${date}`)) continue
              const prefs = (await prefsFor(date)).get(m.id) ?? { breakfastCount: 1, lunchCount: 1, dinnerCount: 1 }
              rows.push({
                messId,
                memberId: m.id,
                logDate: day,
                breakfastCount: prefs.breakfastCount,
                lunchCount: prefs.lunchCount,
                dinnerCount: prefs.dinnerCount,
                guestCount: 0,
                frozen: false,
                isOverride: false,
                overrideType: null as string | null,
              })
            }
          }

          if (rows.length > 0) await prisma.dailyLog.createMany({ data: rows, skipDuplicates: true })
        }
      }
    }

    // After filling, so a guest's last stay days are recorded before they are switched off
    await deactivateExpiredGuests(messId, today)

    await redisSet(markerKey(messId, today), 1, MARKER_TTL_SECONDS)
  } catch (err) {
    // Never block a read because backfill failed — the next request retries.
    console.error('[ensureDailyLogs] messId=%s', messId, err)
  }
}

/** Clear today's marker so the next read re-checks (e.g. after a member joins). */
export async function invalidateDailyLogsMarker(messId: string): Promise<void> {
  const settings = await requireMessSettings(messId).catch(() => null)
  if (!settings) return
  await redisDel(markerKey(messId, todayIn(settings.timezone)))
}

/**
 * Record every day up to today with the CURRENT settings before something
 * changes them (a member's defaults, a mess meal switch, a member's status).
 * Without this, days nobody has viewed yet would later be filled using the
 * NEW settings — e.g. switching breakfast off on the 20th would remove
 * breakfast from the 1st–19th as well.
 */
export async function settleDailyLogs(messId: string): Promise<void> {
  await ensureDailyLogs(messId)
}

/**
 * A member being re-activated: record the days they were away as 0 meals,
 * so the auto-fill does not later charge them for days they were inactive.
 */
export async function recordInactiveGap(messId: string, memberId: string): Promise<void> {
  const settings = await requireMessSettings(messId)
  const today = todayIn(settings.timezone)
  const period = await getCurrentPeriod(messId)
  const member = await prisma.member.findUnique({ where: { id: memberId }, select: { joinedAt: true } })
  if (!period || !member) return

  const todayObj = new Date(`${today}T00:00:00.000Z`)
  const joined = new Date(`${isoDate(member.joinedAt)}T00:00:00.000Z`)
  const from = period.startDate > joined ? period.startDate : joined
  const to = new Date(Math.min(period.endDate.getTime(), todayObj.getTime() - DAY_MS)) // up to yesterday

  const rows = []
  for (let t = from.getTime(); t <= to.getTime(); t += DAY_MS) {
    rows.push({
      messId,
      memberId,
      logDate: new Date(t),
      breakfastCount: 0,
      lunchCount: 0,
      dinnerCount: 0,
      guestCount: 0,
      frozen: false,
      isOverride: true,
      overrideType: 'SYSTEM' as string | null,
    })
  }
  // skipDuplicates keeps any day that was really recorded before they left
  if (rows.length > 0) await prisma.dailyLog.createMany({ data: rows, skipDuplicates: true })
}
