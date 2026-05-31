/**
 * /api/cron/generate-daily-meals
 *
 * Runs daily at midnight (00:05 to let timezone offsets settle).
 * For each active mess, determines "today" in the mess timezone (from its
 * first TelegramGroup; falls back to Asia/Dhaka), then creates DailyLog rows
 * for every active member who does not yet have a record for that date,
 * using each member's stored UserMealPreference as the default values.
 *
 * This implements the "default-driven meal system": members get a log
 * automatically; they only interact when they need an exception.
 *
 * Uses INSERT ... ON CONFLICT DO NOTHING (skipDuplicates) for idempotency.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getBulkMealDefaults } from '@/lib/meal-preferences'
import { DEFAULT_TIMEZONE } from '@/lib/constants'

function localDateInTimezone(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date())
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = req.headers.get('Authorization')
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
    }
  }

  const messes = await prisma.mess.findMany({
    where: { isActive: true },
    select: {
      id: true,
      telegramGroups: {
        where: { isActive: true },
        select: { timezone: true },
        take: 1,
      },
      members: {
        where: { isActive: true },
        select: { id: true },
      },
    },
  })

  let totalCreated = 0
  let totalSkipped = 0

  for (const mess of messes) {
    if (mess.members.length === 0) continue

    const timezone = mess.telegramGroups[0]?.timezone ?? DEFAULT_TIMEZONE
    const today = localDateInTimezone(timezone)
    const todayObj = new Date(`${today}T00:00:00.000Z`)
    const memberIds = mess.members.map((m) => m.id)

    // Find members who already have a log for today
    const existingLogs = await prisma.dailyLog.findMany({
      where: { messId: mess.id, logDate: todayObj, memberId: { in: memberIds } },
      select: { memberId: true },
    })
    const existingSet = new Set(existingLogs.map((l) => l.memberId))

    const missingIds = memberIds.filter((id) => !existingSet.has(id))
    if (missingIds.length === 0) {
      totalSkipped += memberIds.length
      continue
    }

    // Fetch preferences for members who need a new log
    const prefsMap = await getBulkMealDefaults(missingIds, mess.id, today)

    // Bulk create — one row per member, skipDuplicates for idempotency
    const createData = missingIds.map((memberId) => {
      const prefs = prefsMap.get(memberId) ?? { breakfastCount: 1, lunchCount: 1, dinnerCount: 1 }
      return {
        memberId,
        messId: mess.id,
        logDate: todayObj,
        breakfastCount: prefs.breakfastCount,
        lunchCount: prefs.lunchCount,
        dinnerCount: prefs.dinnerCount,
        frozen: false,
        isOverride: false,
        overrideType: null as string | null,
      }
    })

    await prisma.dailyLog.createMany({ data: createData, skipDuplicates: true })

    totalCreated += missingIds.length
    totalSkipped += existingSet.size
  }

  return NextResponse.json({
    ok: true,
    messesProcessed: messes.length,
    logsCreated: totalCreated,
    logsSkipped: totalSkipped,
  })
}
