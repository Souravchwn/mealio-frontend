import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Runs every hour via Vercel cron
// Sends Telegram warning to linked members 30 minutes before cut-off time
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
  const currentMinutes = now.getHours() * 60 + now.getMinutes()

  const messes = await prisma.mess.findMany({
    where: { isActive: true },
    select: { id: true, name: true, cutOffTime: true },
  })

  let warned = 0

  for (const mess of messes) {
    // cutOffTime is DateTime @db.Time — extract HH:MM from the ISO string
    const cutOffStr = mess.cutOffTime.toISOString().slice(11, 16)
    const [h, m] = cutOffStr.split(':').map(Number)
    const cutoffMinutes = h * 60 + m
    const diff = cutoffMinutes - currentMinutes

    if (diff < 25 || diff > 35) continue

    const members = await prisma.member.findMany({
      where: { messId: mess.id, isActive: true, telegramLinked: true },
      select: { telegramUid: true },
    })

    for (const member of members) {
      if (!member.telegramUid) continue
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: member.telegramUid.toString(),
          text: `⏰ *Meal cut-off reminder*\n\nCut-off time for *${mess.name}* is at *${cutOffStr}* (30 minutes away).\n\nUpdate your meals now with \`/meal\` commands before it's too late!`,
          parse_mode: 'Markdown',
        }),
      })
      warned++
    }
  }

  return NextResponse.json({ ok: true, warned })
}
