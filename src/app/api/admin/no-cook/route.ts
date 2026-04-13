import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { getMemberMealDefaults } from '@/lib/meal-preferences'

// Shared helper — also used by the Telegram webhook
export async function broadcastTelegram(
  messId: string,
  text: string,
): Promise<number> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  if (!botToken) return 0

  const linked = await prisma.member.findMany({
    where: { messId, isActive: true, telegramLinked: true },
    select: { telegramUid: true },
  })

  const uids = linked.filter(m => m.telegramUid)
  await Promise.all(
    uids.map(m =>
      fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: Number(m.telegramUid), text, parse_mode: 'Markdown' }),
      }),
    ),
  )
  return uids.length
}

/**
 * POST /api/admin/no-cook
 *
 * Body:
 *   { date?: "YYYY-MM-DD", action: "off" | "on", reason?: string }
 *
 * Turns all member meals ON or OFF for the given date and broadcasts via Telegram.
 */
export async function POST(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  if (payload.role !== 'ADMIN' && payload.role !== 'MANAGER') {
    return NextResponse.json({ detail: 'Admin or Manager access required' }, { status: 403 })
  }

  const body = await req.json()
  const action: 'on' | 'off' = body.action === 'on' ? 'on' : 'off'
  const date: string = body.date ?? new Date().toISOString().slice(0, 10)
  const reason: string = body.reason ?? ''
  const messId: string = payload.messId

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ detail: 'Invalid date format. Use YYYY-MM-DD.' }, { status: 400 })
  }

  const dateObj = new Date(`${date}T00:00:00.000Z`)

  const members = await prisma.member.findMany({
    where: { messId, isActive: true },
    select: { id: true },
  })

  if (action === 'off') {
    // Set all meal counts to 0 (ADMIN override)
    await Promise.all(members.map(m =>
      prisma.dailyLog.upsert({
        where: { messId_memberId_logDate: { messId, memberId: m.id, logDate: dateObj } },
        create: {
          memberId: m.id,
          messId,
          logDate: dateObj,
          breakfastCount: 0,
          lunchCount: 0,
          dinnerCount: 0,
          guestCount: 0,
          frozen: false,
          isOverride: true,
          overrideType: 'ADMIN',
        },
        update: { breakfastCount: 0, lunchCount: 0, dinnerCount: 0, isOverride: true, overrideType: 'ADMIN' },
      }),
    ))
  } else {
    // Restore each member to their preference defaults
    await Promise.all(members.map(async (m) => {
      const defaults = await getMemberMealDefaults(m.id, messId, date)
      await prisma.dailyLog.upsert({
        where: { messId_memberId_logDate: { messId, memberId: m.id, logDate: dateObj } },
        create: {
          memberId: m.id,
          messId,
          logDate: dateObj,
          breakfastCount: defaults.breakfastCount,
          lunchCount: defaults.lunchCount,
          dinnerCount: defaults.dinnerCount,
          guestCount: 0,
          frozen: false,
          isOverride: false,
          overrideType: null,
        },
        update: {
          breakfastCount: defaults.breakfastCount,
          lunchCount: defaults.lunchCount,
          dinnerCount: defaults.dinnerCount,
          isOverride: false,
          overrideType: null,
        },
      })
    }))
  }

  // Telegram broadcast (non-blocking)
  let broadcastMsg: string
  if (action === 'off') {
    const reasonLine = reason ? `\n📝 *Reason:* ${reason}` : ''
    broadcastMsg = `🚫 *No Meals — ${date}*\n\nAll meals have been turned *OFF* for ${date}.${reasonLine}\n\n_Turn individual meals back on with \`/meal on\` if needed._`
  } else {
    broadcastMsg = `✅ *Meals Restored — ${date}*\n\nMeals have been restored to your personal defaults for ${date}.\n\nAdjust individually: \`/meal breakfast\` \`/meal lunch\` \`/meal dinner\``
  }

  const notified = await broadcastTelegram(messId, broadcastMsg)

  return NextResponse.json({
    ok: true,
    date,
    action,
    members_updated: members.length,
    telegram_notified: notified,
  })
}
