import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { monthRange, countMealSlots } from '@/lib/financial'

interface TelegramUser {
  id: number
  first_name: string
  username?: string
}

interface TelegramChat {
  id: number
  type: string
}

interface TelegramMessage {
  message_id: number
  from?: TelegramUser
  chat: TelegramChat
  text?: string
}

interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
}

async function sendMessage(chatId: number, text: string): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  if (!botToken) return
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Always return 200 to prevent Telegram retry storms
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (webhookSecret) {
    const incoming = req.headers.get('x-telegram-bot-api-secret-token')
    if (incoming !== webhookSecret) return NextResponse.json({ ok: true })
  }

  let update: TelegramUpdate
  try {
    update = await req.json()
  } catch {
    return NextResponse.json({ ok: true })
  }

  const message = update.message
  if (!message?.text || !message.from) return NextResponse.json({ ok: true })

  const chatId = message.chat.id
  const telegramUid = message.from.id
  const text = message.text.trim()

  // ── /start ────────────────────────────────────────────────────────────────
  if (text === '/start' || text.startsWith('/start ')) {
    await sendMessage(
      chatId,
      `*Welcome to Mealio Bot!* 🍽\n\nLink your Mealio account with your phone number:\n\`/link +8801XXXXXXXXX\`\n\nAvailable commands after linking:\n• \`/status\` — today's meal status\n• \`/meal on|off\` — all meals on/off\n• \`/meal breakfast|lunch|dinner\` — toggle a slot\n• \`/meal guest N\` — set guest count\n• \`/rate\` — current meal rate\n• \`/balance\` — your balance`,
    )
    return NextResponse.json({ ok: true })
  }

  // ── /link <phone> ─────────────────────────────────────────────────────────
  if (text.startsWith('/link ')) {
    const phone = text.slice(6).trim()
    if (!phone) {
      await sendMessage(chatId, `❌ Usage: \`/link +8801712345678\``)
      return NextResponse.json({ ok: true })
    }

    const member = await prisma.member.findFirst({
      where: { phone, isActive: true },
      select: { id: true, name: true },
    })

    if (!member) {
      await sendMessage(chatId, `❌ No account found with phone \`${phone}\`.\n\nCheck the number or register at the Mealio web app first.`)
      return NextResponse.json({ ok: true })
    }

    await prisma.member.update({
      where: { id: member.id },
      data: { telegramUid: BigInt(telegramUid), telegramLinked: true },
    })

    await sendMessage(
      chatId,
      `✅ Linked! Welcome, *${member.name}*!\n\n*Available commands:*\n• \`/status\` — today's meal status\n• \`/meal on\` — all meals ON\n• \`/meal off\` — all meals OFF\n• \`/meal breakfast\` — toggle breakfast\n• \`/meal lunch\` — toggle lunch\n• \`/meal dinner\` — toggle dinner\n• \`/meal guest 2\` — set 2 guests\n• \`/rate\` — current meal rate\n• \`/balance\` — your balance`,
    )
    return NextResponse.json({ ok: true })
  }

  // All commands below require a linked account
  const member = await prisma.member.findFirst({
    where: { telegramUid: BigInt(telegramUid), isActive: true },
    select: { id: true, messId: true, name: true, role: true },
  })

  if (!member || !member.messId) {
    await sendMessage(chatId, `❌ Account not linked.\n\nSend \`/link <your-phone-number>\` to connect your Mealio account.`)
    return NextResponse.json({ ok: true })
  }

  const today = new Date().toISOString().slice(0, 10)
  const currentMonth = today.slice(0, 7)
  const { start: monthStart, end: monthEnd } = monthRange(currentMonth)

  // ── /status ───────────────────────────────────────────────────────────────
  if (text === '/status') {
    const log = await prisma.dailyLog.findFirst({
      where: { memberId: member.id, messId: member.messId, logDate: new Date(`${today}T00:00:00.000Z`) },
      select: { breakfast: true, lunch: true, dinner: true, guestCount: true, frozen: true },
    })

    if (!log) {
      await sendMessage(chatId, `📋 No log for today (${today}). All meals are *ON* by default.`)
      return NextResponse.json({ ok: true })
    }

    const lines = [
      `📅 *Today's Meals — ${today}*`,
      `🍳 Breakfast: ${log.breakfast ? '✅ ON' : '❌ OFF'}`,
      `🍱 Lunch: ${log.lunch ? '✅ ON' : '❌ OFF'}`,
      `🌙 Dinner: ${log.dinner ? '✅ ON' : '❌ OFF'}`,
      `👥 Guests: ${log.guestCount}`,
      log.frozen ? '\n🔒 _This day is frozen_' : '',
    ].filter(Boolean).join('\n')

    await sendMessage(chatId, lines)
    return NextResponse.json({ ok: true })
  }

  // ── /rate ─────────────────────────────────────────────────────────────────
  if (text === '/rate') {
    const [exps, logs] = await Promise.all([
      prisma.expense.findMany({ where: { messId: member.messId, expenseDate: { gte: monthStart, lte: monthEnd } }, select: { amount: true } }),
      prisma.dailyLog.findMany({ where: { messId: member.messId, logDate: { gte: monthStart, lte: monthEnd } }, select: { breakfast: true, lunch: true, dinner: true, guestCount: true } }),
    ])
    const totalExpense = exps.reduce((s, e) => s + Number(e.amount), 0)
    const totalMeals = countMealSlots(logs)
    const rate = totalMeals > 0 ? totalExpense / totalMeals : 0

    await sendMessage(chatId, `📊 *Meal Rate — ${currentMonth}*\n\nTotal Expense: ৳${totalExpense.toFixed(2)}\nTotal Meals: ${totalMeals}\nMeal Rate: ৳${rate.toFixed(2)} per meal`)
    return NextResponse.json({ ok: true })
  }

  // ── /balance ──────────────────────────────────────────────────────────────
  if (text === '/balance') {
    if (member.role === 'GUEST') {
      await sendMessage(chatId, `❌ Balance information is not available for guest accounts.`)
      return NextResponse.json({ ok: true })
    }

    const [exps, logs, memberExps, myLogs] = await Promise.all([
      prisma.expense.findMany({ where: { messId: member.messId, expenseDate: { gte: monthStart, lte: monthEnd } }, select: { amount: true } }),
      prisma.dailyLog.findMany({ where: { messId: member.messId, logDate: { gte: monthStart, lte: monthEnd } }, select: { breakfast: true, lunch: true, dinner: true, guestCount: true } }),
      prisma.expense.findMany({ where: { addedBy: member.id, expenseDate: { gte: monthStart, lte: monthEnd } }, select: { amount: true } }),
      prisma.dailyLog.findMany({ where: { memberId: member.id, logDate: { gte: monthStart, lte: monthEnd } }, select: { breakfast: true, lunch: true, dinner: true, guestCount: true } }),
    ])

    const totalExpense = exps.reduce((s, e) => s + Number(e.amount), 0)
    const totalMeals = countMealSlots(logs)
    const mealRate = totalMeals > 0 ? totalExpense / totalMeals : 0
    const contributed = memberExps.reduce((s, e) => s + Number(e.amount), 0)
    const myMeals = countMealSlots(myLogs)
    const balance = contributed - myMeals * mealRate

    const sign = balance >= 0 ? '+' : ''
    await sendMessage(chatId, `💰 *Balance — ${currentMonth}*\n\nContributed: ৳${contributed.toFixed(2)}\nMeal Cost: ৳${(myMeals * mealRate).toFixed(2)}\nBalance: ${sign}৳${balance.toFixed(2)}\n\n${balance >= 0 ? '✅ You are ahead' : '⚠️ You owe the mess'}`)
    return NextResponse.json({ ok: true })
  }

  // ── /meal ... ─────────────────────────────────────────────────────────────
  if (text.startsWith('/meal')) {
    const mess = await prisma.mess.findUnique({
      where: { id: member.messId },
      select: { cutOffTime: true },
    })

    const cutOffTime = mess?.cutOffTime
      ? mess.cutOffTime.toISOString().slice(11, 16)
      : '21:00'
    const [h, mH] = cutOffTime.split(':').map(Number)
    const cutoff = new Date()
    cutoff.setHours(h, mH, 0, 0)

    if (Date.now() >= cutoff.getTime()) {
      await sendMessage(chatId, `⏰ Cut-off time (${cutOffTime}) has passed. Cannot change today's meals.`)
      return NextResponse.json({ ok: true })
    }

    const todayObj = new Date(`${today}T00:00:00.000Z`)

    let log = await prisma.dailyLog.findFirst({
      where: { memberId: member.id, messId: member.messId, logDate: todayObj },
      select: { id: true, breakfast: true, lunch: true, dinner: true, guestCount: true, frozen: true },
    })

    if (!log) {
      log = await prisma.dailyLog.create({
        data: { memberId: member.id, messId: member.messId, logDate: todayObj, breakfast: true, lunch: true, dinner: true, guestCount: 0, frozen: false },
        select: { id: true, breakfast: true, lunch: true, dinner: true, guestCount: true, frozen: true },
      })
    }

    if (!log) {
      await sendMessage(chatId, `❌ Failed to load meal log. Please try again.`)
      return NextResponse.json({ ok: true })
    }

    if (log.frozen) {
      await sendMessage(chatId, `🔒 Today's meals are frozen and cannot be changed.`)
      return NextResponse.json({ ok: true })
    }

    const parts = text.split(/\s+/)
    const cmd = parts[1]?.toLowerCase()

    if (text === '/meal on') {
      await prisma.dailyLog.update({ where: { id: log.id }, data: { breakfast: true, lunch: true, dinner: true } })
      await sendMessage(chatId, `✅ All meals turned *ON* for today.\n🍳 Breakfast · 🍱 Lunch · 🌙 Dinner`)
    } else if (text === '/meal off') {
      await prisma.dailyLog.update({ where: { id: log.id }, data: { breakfast: false, lunch: false, dinner: false } })
      await sendMessage(chatId, `❌ All meals turned *OFF* for today.`)
    } else if (cmd === 'breakfast' || cmd === 'lunch' || cmd === 'dinner') {
      const current = log[cmd as 'breakfast' | 'lunch' | 'dinner']
      const newVal = !current
      await prisma.dailyLog.update({ where: { id: log.id }, data: { [cmd]: newVal } })
      const emoji = cmd === 'breakfast' ? '🍳' : cmd === 'lunch' ? '🍱' : '🌙'
      const label = cmd.charAt(0).toUpperCase() + cmd.slice(1)
      await sendMessage(chatId, `${emoji} *${label}* turned ${newVal ? '*ON* ✅' : '*OFF* ❌'}`)
    } else if (cmd === 'guest') {
      const count = parseInt(parts[2] ?? '', 10)
      if (isNaN(count) || count < 0) {
        await sendMessage(chatId, `❌ Invalid guest count.\nUsage: \`/meal guest 2\``)
        return NextResponse.json({ ok: true })
      }
      await prisma.dailyLog.update({ where: { id: log.id }, data: { guestCount: count } })
      await sendMessage(chatId, `👥 Guest count set to *${count}*`)
    } else {
      await sendMessage(chatId, `❓ Unknown meal command.\n\nAvailable:\n\`/meal on\` \`/meal off\`\n\`/meal breakfast\` \`/meal lunch\` \`/meal dinner\`\n\`/meal guest N\``)
    }

    return NextResponse.json({ ok: true })
  }

  // ── Fallback ──────────────────────────────────────────────────────────────
  await sendMessage(chatId, `❓ Unknown command. Send \`/start\` to see available commands.`)
  return NextResponse.json({ ok: true })
}
