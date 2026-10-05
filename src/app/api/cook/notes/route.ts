/**
 * /api/cook/notes
 *
 * GET  ?date=YYYY-MM-DD — Returns cook notes for a given date (defaults to today in mess timezone).
 * POST — Save/update a cook note for one meal slot.
 *        Body: { slot: 'BREAKFAST'|'LUNCH'|'DINNER', note: string, date?: 'YYYY-MM-DD' }
 *
 * Any authenticated member can save a note (not role-restricted — any cook can update).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { DEFAULT_TIMEZONE, MEAL_TYPES } from '@/lib/constants'

function todayInTimezone(tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
}

export async function GET(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)

  // Resolve timezone for default date
  const mess = await prisma.mess.findUnique({
    where: { id: payload.messId },
    select: { telegramGroups: { where: { isActive: true }, select: { timezone: true }, take: 1 } },
  })
  const timezone = mess?.telegramGroups[0]?.timezone ?? DEFAULT_TIMEZONE
  const dateStr = searchParams.get('date') || todayInTimezone(timezone)
  const logDateObj = new Date(`${dateStr}T00:00:00.000Z`)

  try {
    const notes = await prisma.dailyCookNote.findMany({
      where: { messId: payload.messId, logDate: logDateObj },
      select: { slot: true, note: true, updatedAt: true },
    })

    const noteMap: Record<string, string | null> = {}
    for (const n of notes) noteMap[n.slot] = n.note ?? null

    return NextResponse.json({
      date: dateStr,
      notes: {
        BREAKFAST: noteMap['BREAKFAST'] ?? null,
        LUNCH: noteMap['LUNCH'] ?? null,
        DINNER: noteMap['DINNER'] ?? null,
      },
    })
  } catch {
    // Table may not exist yet in pre-migration DBs
    return NextResponse.json({
      date: dateStr,
      notes: { BREAKFAST: null, LUNCH: null, DINNER: null },
    })
  }
}

export async function POST(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { slot, note, date } = body as { slot?: string; note?: string; date?: string }

  const slotUpper = (slot as string)?.toUpperCase()
  if (!MEAL_TYPES.includes(slotUpper as typeof MEAL_TYPES[number])) {
    return NextResponse.json({ detail: 'Invalid slot — must be BREAKFAST, LUNCH, or DINNER' }, { status: 400 })
  }
  if (typeof note !== 'string') {
    return NextResponse.json({ detail: 'note must be a string' }, { status: 400 })
  }
  if (note.length > 500) {
    return NextResponse.json({ detail: 'Note is too long (max 500 characters)' }, { status: 400 })
  }
  if (date !== undefined && (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date))) {
    return NextResponse.json({ detail: 'Date must be YYYY-MM-DD' }, { status: 400 })
  }

  // Resolve date
  const mess = await prisma.mess.findUnique({
    where: { id: payload.messId },
    select: { telegramGroups: { where: { isActive: true }, select: { timezone: true }, take: 1 } },
  })
  const timezone = mess?.telegramGroups[0]?.timezone ?? DEFAULT_TIMEZONE
  const dateStr = date || todayInTimezone(timezone)
  const logDateObj = new Date(`${dateStr}T00:00:00.000Z`)

  try {
    await prisma.dailyCookNote.upsert({
      where: { messId_logDate_slot: { messId: payload.messId, logDate: logDateObj, slot: slotUpper } },
      create: {
        messId: payload.messId,
        logDate: logDateObj,
        slot: slotUpper,
        note: note.trim() || null,
        updatedBy: payload.sub,
      },
      update: {
        note: note.trim() || null,
        updatedBy: payload.sub,
      },
    })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
