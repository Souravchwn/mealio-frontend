/**
 * /api/me — the signed-in person's own account.
 *   GET    → download everything we hold about them (JSON)
 *   DELETE { password } → delete the account. Personal details are wiped;
 *          meal and money records stay (anonymised) so the mess's accounts
 *          still add up.
 */

import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken, clientIp } from '@/lib/auth-utils'
import { randomToken } from '@/lib/tokens'
import { invalidateDailyLogsMarker, settleDailyLogs } from '@/lib/daily-logs'
import { logSecurityEvent } from '@/lib/security-events'

export async function GET(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  try {
    const [profile, preferences, meals, ledger, expenses, tickets] = await Promise.all([
      prisma.member.findUnique({
        where: { id: payload.sub },
        select: {
          id: true, name: true, email: true, phone: true, role: true, joinedAt: true,
          emailVerifiedAt: true, telegramLinked: true, lastLoginAt: true,
          mess: { select: { name: true } },
        },
      }),
      prisma.userMealPreference.findMany({
        where: { memberId: payload.sub },
        select: { mealType: true, dayType: true, enabled: true, defaultCount: true },
      }),
      prisma.dailyLog.findMany({
        where: { memberId: payload.sub },
        select: { logDate: true, breakfastCount: true, lunchCount: true, dinnerCount: true, guestCount: true, guestBreakfast: true, guestLunch: true, guestDinner: true },
        orderBy: { logDate: 'asc' },
      }),
      prisma.ledgerEntry.findMany({
        where: { memberId: payload.sub },
        select: { entryType: true, amount: true, note: true, createdAt: true, isVoided: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.expense.findMany({
        where: { addedBy: payload.sub },
        select: { amount: true, category: true, description: true, expenseDate: true },
        orderBy: { expenseDate: 'asc' },
      }),
      prisma.supportTicket.findMany({
        where: { memberId: payload.sub },
        select: { subject: true, status: true, createdAt: true, messages: { select: { authorType: true, body: true, createdAt: true } } },
      }),
    ])

    const data = {
      exported_at: new Date().toISOString(),
      profile,
      meal_preferences: preferences,
      meals: meals.map((m) => ({ ...m, logDate: m.logDate.toISOString().slice(0, 10) })),
      deposits_and_ledger: ledger.map((l) => ({ ...l, amount: Number(l.amount) })),
      bazaar_recorded: expenses.map((e) => ({ ...e, amount: Number(e.amount), expenseDate: e.expenseDate.toISOString().slice(0, 10) })),
      support_tickets: tickets,
    }
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="mealio-my-data-${new Date().toISOString().slice(0, 10)}.json"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[GET /api/me]', err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  let body: { password?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ detail: 'Invalid request body' }, { status: 400 })
  }

  try {
    const me = await prisma.member.findUnique({
      where: { id: payload.sub },
      select: { id: true, passwordHash: true, role: true, messId: true, email: true },
    })
    if (!me) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
    if (typeof body.password !== 'string' || !me.passwordHash || !(await bcrypt.compare(body.password, me.passwordHash))) {
      return NextResponse.json({ detail: 'Your password is not correct.' }, { status: 400 })
    }

    // A mess must never be left without an admin while others still use it
    if (me.role === 'ADMIN' && me.messId) {
      const [otherAdmins, others] = await Promise.all([
        prisma.member.count({ where: { messId: me.messId, role: 'ADMIN', isActive: true, id: { not: me.id } } }),
        prisma.member.count({ where: { messId: me.messId, isActive: true, id: { not: me.id } } }),
      ])
      if (others > 0 && otherAdmins === 0) {
        return NextResponse.json(
          { detail: 'Make another member an admin first, or delete the mess.', code: 'LAST_ADMIN' },
          { status: 400 },
        )
      }
    }

    if (me.messId) await settleDailyLogs(me.messId)
    await prisma.member.update({
      where: { id: me.id },
      data: {
        name: 'Deleted member',
        email: `deleted+${me.id}@mealio.invalid`,
        phone: null,
        passwordHash: await bcrypt.hash(randomToken(), 10),
        telegramUid: null,
        telegramLinked: false,
        isActive: false,
        deletedAt: new Date(),
        passwordChangedAt: new Date(),
      },
    })
    await prisma.userMealPreference.deleteMany({ where: { memberId: me.id } })
    if (me.messId) await invalidateDailyLogsMarker(me.messId)
    await logSecurityEvent({ type: 'ACCOUNT_DELETED', severity: 'WARN', memberId: me.id, messId: me.messId, ip: clientIp(req) })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[DELETE /api/me]', err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
