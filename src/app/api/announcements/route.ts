/**
 * GET  /api/announcements — any member: broadcasts from the last few days, newest first.
 * POST /api/announcements — Admin or Manager: { message } sends a new broadcast.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { createAudit } from '@/lib/audit'
import { checkRateLimit } from '@/lib/rate-limit'
import { ANNOUNCEMENT_DAILY_LIMIT, ANNOUNCEMENT_MAX_LENGTH } from '@/lib/constants'
import { announcementToResponse, listActiveAnnouncements } from '@/lib/announcements'

export async function GET(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  try {
    const rows = await listActiveAnnouncements(payload.messId)
    return NextResponse.json({ announcements: rows.map(announcementToResponse) })
  } catch (err) {
    console.error('[GET /api/announcements] messId=%s', payload.messId, err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  if (payload.role !== 'ADMIN' && payload.role !== 'MANAGER') {
    return NextResponse.json({ detail: 'Admin or Manager access required' }, { status: 403 })
  }

  let body: { message?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ detail: 'Invalid request body' }, { status: 400 })
  }
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (!message) return NextResponse.json({ detail: 'Write a message to send.' }, { status: 400 })
  if (message.length > ANNOUNCEMENT_MAX_LENGTH) {
    return NextResponse.json(
      { detail: `Keep broadcasts under ${ANNOUNCEMENT_MAX_LENGTH} characters.` },
      { status: 400 },
    )
  }

  // At most 10 broadcasts per mess per day, so nobody spams the whole mess
  const quota = await checkRateLimit('announce', payload.messId, ANNOUNCEMENT_DAILY_LIMIT, 24 * 60 * 60 * 1000)
  if (!quota.allowed) {
    return NextResponse.json(
      { detail: `Your mess has sent ${ANNOUNCEMENT_DAILY_LIMIT} broadcasts today. Try again tomorrow.` },
      { status: 429 },
    )
  }

  try {
    const author = await prisma.member.findUnique({ where: { id: payload.sub }, select: { name: true } })
    const created = await prisma.announcement.create({
      data: { messId: payload.messId, authorId: payload.sub, authorName: author?.name ?? 'Admin', message },
      select: { id: true, message: true, authorName: true, createdAt: true },
    })
    await createAudit({
      messId: payload.messId,
      actorId: payload.sub,
      action: 'POST_ANNOUNCEMENT',
      targetTable: 'announcements',
      targetId: created.id,
      newValue: { message },
    })
    return NextResponse.json({ ok: true, announcement: announcementToResponse(created) }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/announcements] messId=%s', payload.messId, err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
