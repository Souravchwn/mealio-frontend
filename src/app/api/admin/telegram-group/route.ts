/**
 * GET  /api/admin/telegram-group — Returns the current active Telegram group for the mess.
 * POST /api/admin/telegram-group — Register or update a Telegram group → mess mapping.
 *   Body: { chat_id, chat_name, timezone? }
 *
 * The group's timezone is the mess timezone, so settings are refreshed in Redis after a change.
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { groupRepo } from '@/lib/telegram'
import { prisma } from '@/lib/prisma'
import { DEFAULT_TIMEZONE } from '@/lib/constants'
import { isValidTimezone, refreshMessSettings } from '@/lib/mess-settings'
import { createAudit } from '@/lib/audit'

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
    // A chat already linked to another mess must not be silently taken over
    const existing = await prisma.telegramGroup.findUnique({ where: { chatId }, select: { messId: true, isActive: true } })
    if (existing && existing.isActive && existing.messId !== payload.messId) {
      return NextResponse.json({ detail: 'This Telegram group is already linked to another mess' }, { status: 409 })
    }

    // One active group per mess
    await prisma.telegramGroup.updateMany({
      where: { messId: payload.messId, isActive: true, chatId: { not: chatId } },
      data: { isActive: false },
    })
    const group = await groupRepo.register(chatId, chatName, payload.messId, timezone)
    await createAudit({
      messId: payload.messId,
      actorId: payload.sub,
      action: 'ADMIN_SETTINGS_UPDATE',
      targetTable: 'telegram_groups',
      newValue: { chat_id: chatId, chat_name: chatName, timezone },
    })
    await refreshMessSettings(payload.messId)
    return NextResponse.json({ ok: true, group })
  } catch (err) {
    console.error('[POST /api/admin/telegram-group]', err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
