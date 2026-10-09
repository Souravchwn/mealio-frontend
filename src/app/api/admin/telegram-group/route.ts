/**
 * GET  /api/admin/telegram-group — Returns the current active Telegram group for the mess.
 * POST /api/admin/telegram-group — Register or update a Telegram group → mess mapping.
 *   Body: { chat_id, chat_name, timezone? }
 *
 * The group's timezone is the mess timezone, so settings are refreshed in Redis after a change.
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { linkGroupToMess } from '@/lib/telegram/services/group-link.service'
import { prisma } from '@/lib/prisma'
import { DEFAULT_TIMEZONE } from '@/lib/constants'
import { isValidTimezone } from '@/lib/mess-settings'

export async function GET(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'ADMIN') return NextResponse.json({ detail: 'Admin only' }, { status: 403 })

  try {
    const group = await prisma.telegramGroup.findFirst({
      where: { messId: payload.messId, isActive: true },
      select: { chatId: true, chatName: true, timezone: true },
    })
    return NextResponse.json({ group: group ? { chatId: group.chatId, chatName: group.chatName, timezone: group.timezone } : null })
  } catch (err) {
    console.error('[GET /api/admin/telegram-group]', err)
    return NextResponse.json({ group: null })
  }
}

export async function POST(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'ADMIN') return NextResponse.json({ detail: 'Admin only' }, { status: 403 })

  let body: { chat_id?: unknown; chat_name?: unknown; timezone?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ detail: 'Invalid request body' }, { status: 400 })
  }
  const chatId = String(body.chat_id ?? '').trim()
  const chatName = String(body.chat_name ?? '').trim()
  const timezone = String(body.timezone || DEFAULT_TIMEZONE).trim()

  if (!/^-?\d+$/.test(chatId)) return NextResponse.json({ detail: 'chat_id must be a numeric Telegram chat id' }, { status: 400 })
  if (!isValidTimezone(timezone)) {
    return NextResponse.json({ detail: 'Unknown timezone. Use an IANA name like Asia/Dhaka.' }, { status: 400 })
  }

  try {
    const result = await linkGroupToMess({ chatId, chatName, messId: payload.messId, actorId: payload.sub, timezone })
    if (!result.ok) {
      return NextResponse.json({ detail: 'This Telegram group is already linked to another mess' }, { status: 409 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[POST /api/admin/telegram-group]', err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
