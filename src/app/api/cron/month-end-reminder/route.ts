import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Runs at 8 PM on days 28-31 via Vercel cron
// Sends month-end reminder to ADMIN members via Telegram if it's the last day of the month
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

  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const lastDayOfMonth = new Date(year, month, 0).getDate()

  if (now.getDate() !== lastDayOfMonth) {
    return NextResponse.json({ ok: true, reason: 'Not last day of month' })
  }

  const yearMonth = `${year}-${String(month).padStart(2, '0')}`

  const messes = await prisma.mess.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  })

  let reminded = 0

  for (const mess of messes) {
    const monthRecord = await prisma.messMonth.findFirst({
      where: { messId: mess.id, yearMonth },
      select: { isClosed: true },
    })

    if (monthRecord?.isClosed) continue

    const admins = await prisma.member.findMany({
      where: { messId: mess.id, role: 'ADMIN', isActive: true, telegramLinked: true },
      select: { telegramUid: true, name: true },
    })

    for (const admin of admins) {
      if (!admin.telegramUid) continue
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: admin.telegramUid.toString(),
          text: `📅 *Month-End Reminder — ${mess.name}*\n\nToday (${today}) is the last day of ${yearMonth}.\n\nPlease close the month from the Mealio admin dashboard to:\n• Freeze all meal logs\n• Calculate final balances\n• Carry forward to next month\n\n🔗 Go to Matrix → Close Month`,
          parse_mode: 'Markdown',
        }),
      })
      reminded++
    }
  }

  return NextResponse.json({ ok: true, reminded })
}
