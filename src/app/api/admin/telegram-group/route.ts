/**
 * GET  /api/admin/telegram-group — Returns the current active Telegram group for the mess.
 * POST /api/admin/telegram-group — Register or update a Telegram group → mess mapping.
 *   Body: { chat_id, chat_name, timezone? }
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { groupRepo } from '@/lib/telegram'
import { prisma } from '@/lib/prisma'

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
  } catch {
    return NextResponse.json({ group: null })
  }
}

export async function POST(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'ADMIN') return NextResponse.json({ detail: 'Admin only' }, { status: 403 })

  const body = await req.json()
  const chatId = String(body.chat_id ?? '').trim()
  const chatName = String(body.chat_name ?? '').trim()
  const timezone = String(body.timezone ?? 'Asia/Dhaka').trim()

  if (!chatId) return NextResponse.json({ detail: 'chat_id is required' }, { status: 400 })

  const group = await groupRepo.register(chatId, chatName, payload.messId, timezone)
  return NextResponse.json({ ok: true, group })
}
