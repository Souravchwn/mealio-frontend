/**
 * GET /api/tg/home — everything the Telegram Mini App shows, for the person who opened it. Read-only.
 *
 * Identity comes ONLY from Telegram's signed initData (header X-Telegram-Init-Data). Their Mealio
 * account is the one linked to that Telegram id; the mess comes from that account. Nothing else in the
 * request is used. Not linked (or account inactive, mess suspended): `{ linked: false }`.
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyInitData } from '@/lib/telegram/webapp-auth'
import { MemberRepository } from '@/lib/telegram/repositories/member.repository'
import { getMemberDayMeals, getTodayHeadcount, type HeadcountSlot } from '@/lib/today'
import { calculatePeriodSummary } from '@/lib/financial'
import { resolvePeriod } from '@/lib/period'
import { getMessSettings } from '@/lib/mess-settings'
import { checkRateLimit } from '@/lib/rate-limit'

const memberRepo = new MemberRepository()

const slotJson = (s: HeadcountSlot) => ({
  total: s.total,
  guests: s.guestCount,
  cutoff_time: s.cutoffTime,
  // Names only, of people eating this meal (count > 0), with their guests
  people: s.members.filter((m) => m.count > 0).map((m) => ({ name: m.name, count: m.count, guests: m.guestCount })),
})

export async function GET(req: NextRequest) {
  const auth = verifyInitData(req.headers.get('x-telegram-init-data'))
  if (!auth) return NextResponse.json({ detail: 'Open this from Telegram.' }, { status: 401 })

  const rate = await checkRateLimit('tg-home', String(auth.user.id), 60, 5 * 60 * 1000)
  if (!rate.allowed) return NextResponse.json({ detail: 'Slow down a little.' }, { status: 429 })

  const site = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
  try {
    const member = await memberRepo.findByTelegramUid(auth.user.id)
    if (!member) {
      return NextResponse.json({ linked: false, first_name: auth.user.first_name, link_url: `${site}/en/settings` })
    }

    const [settings, period, today, headcount] = await Promise.all([
      getMessSettings(member.messId),
      resolvePeriod(member.messId),
      getMemberDayMeals(member.messId, member.id),
      getTodayHeadcount(member.messId),
    ])
    const summary = await calculatePeriodSummary(member.messId, period)
    const me = summary.forMember(member.id)

    return NextResponse.json({
      linked: true,
      member: { name: member.name, role: member.role },
      mess: {
        name: settings?.name ?? '',
        timezone: settings?.timezone ?? 'Asia/Dhaka',
        period_start: period.startDate.toISOString().slice(0, 10),
        period_end: period.endDate.toISOString().slice(0, 10),
      },
      today: today && {
        date: today.date,
        breakfast: today.breakfastCount,
        lunch: today.lunchCount,
        dinner: today.dinnerCount,
        guests: today.guestCount,
        cutoffs: {
          breakfast: today.slotCutoffs.breakfast.cutoffTime,
          lunch: today.slotCutoffs.lunch.cutoffTime,
          dinner: today.slotCutoffs.dinner.cutoffTime,
        },
        passed: {
          breakfast: today.slotCutoffs.breakfast.cutoffPassed,
          lunch: today.slotCutoffs.lunch.cutoffPassed,
          dinner: today.slotCutoffs.dinner.cutoffPassed,
        },
        frozen: today.frozen,
      },
      money: {
        balance: me.balance,
        meals: me.billableMeals,
        guest_meals: me.guestMeals,
        deposited: me.deposited + me.bazaarCredit,
        carried_in: me.carriedForward,
        meal_cost: me.mealCost,
        meal_rate: summary.mealRate,
      },
      headcount: headcount && {
        breakfast: slotJson(headcount.slots.breakfast),
        lunch: slotJson(headcount.slots.lunch),
        dinner: slotJson(headcount.slots.dinner),
      },
      site_url: site,
    })
  } catch (err) {
    console.error('[GET /api/tg/home] tg=%s', auth.user.id, err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
