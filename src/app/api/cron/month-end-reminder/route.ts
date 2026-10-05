import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Runs daily at 8 PM via Vercel cron
// Sends a reminder to ADMIN members when the current open period is about to end
// (within 2 days of the period's endDate)
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = req.headers.get('Authorization')
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
    }
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN
  if (!botToken) {
    return NextResponse.json({ ok: true, reason: 'No Telegram bot token configured' })
  }

  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  // Find all open periods that end within the next 2 days
  const twoDaysFromNow = new Date(today)
  twoDaysFromNow.setUTCDate(twoDaysFromNow.getUTCDate() + 2)

  const openPeriods = await prisma.messMonth.findMany({
    where: {
      isClosed: false,
      endDate: { lte: twoDaysFromNow },
    },
    select: {
      yearMonth: true,
      startDate: true,
      endDate: true,
      mess: { select: { id: true, name: true } },
    },
  })

  let reminded = 0

  for (const period of openPeriods) {
    const admins = await prisma.member.findMany({
      where: { messId: period.mess.id, role: 'ADMIN', isActive: true, telegramLinked: true },
      select: { telegramUid: true, name: true },
    })

    const startStr = period.startDate.toISOString().slice(0, 10)
    const endStr = period.endDate.toISOString().slice(0, 10)

    for (const admin of admins) {
      if (!admin.telegramUid) continue
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: admin.telegramUid.toString(),
          text: `📅 *Period-End Reminder — ${period.mess.name}*\n\nThe current billing period (${startStr} → ${endStr}) is about to end.\n\nPlease close the month from the Mealio admin dashboard to:\n• Freeze all meal logs\n• Calculate final balances\n• Carry forward to next period\n\n🔗 Go to Matrix → Close Month`,
          parse_mode: 'Markdown',
        }),
      })
      reminded++
    }
  }

  return NextResponse.json({ ok: true, reminded, periodsChecked: openPeriods.length })
}
