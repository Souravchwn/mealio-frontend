/**
 * POST /api/expenses/sessions/[id]/memos  { memos: [{ data: <base64> }] }
 * Adds memo photos to a bazaar trip that was saved without them (or with fewer than the limit).
 * Photos are evidence: they can be added, never edited or removed.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { createAudit } from '@/lib/audit'
import { isDateInClosedPeriod } from '@/lib/period'
import { MAX_MEMOS_PER_SESSION, MEMO_SELECT, parseMemoUploads, serializeMemo } from '@/lib/memos'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Ctx) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'ADMIN' && payload.role !== 'MANAGER') {
    return NextResponse.json({ detail: 'Admin or Manager access required' }, { status: 403 })
  }

  const { id } = await params
  let body: { memos?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ detail: 'Invalid request body' }, { status: 400 })
  }
  const parsed = parseMemoUploads(body.memos)
  if ('error' in parsed) return NextResponse.json({ detail: parsed.error }, { status: 400 })
  if (parsed.memos.length === 0) return NextResponse.json({ detail: 'Choose at least one photo.' }, { status: 400 })

  try {
    const session = await prisma.bazaarSession.findFirst({
      where: { id, messId: payload.messId },
      select: { id: true, isVoided: true, sessionDate: true, _count: { select: { memos: true } } },
    })
    if (!session) return NextResponse.json({ detail: 'Session not found' }, { status: 404 })
    if (session.isVoided) return NextResponse.json({ detail: 'A voided session cannot be changed' }, { status: 400 })
    if (await isDateInClosedPeriod(payload.messId, session.sessionDate)) {
      return NextResponse.json({ detail: 'That date is in a closed month and can no longer be changed' }, { status: 400 })
    }
    if (session._count.memos + parsed.memos.length > MAX_MEMOS_PER_SESSION) {
      return NextResponse.json({ detail: `A bazaar trip can have up to ${MAX_MEMOS_PER_SESSION} memo photos.` }, { status: 400 })
    }

    await prisma.bazaarMemo.createMany({
      data: parsed.memos.map((m) => ({
        sessionId: id,
        messId: payload.messId,
        mimeType: m.mimeType,
        sizeBytes: m.bytes.length,
        data: m.bytes,
        uploadedBy: payload.sub,
      })),
    })
    await createAudit({
      messId: payload.messId,
      actorId: payload.sub,
      action: 'ADD_BAZAAR_MEMO',
      targetTable: 'bazaar_sessions',
      targetId: id,
      newValue: { count: parsed.memos.length },
    })

    const memos = await prisma.bazaarMemo.findMany({ where: { sessionId: id }, select: MEMO_SELECT, orderBy: { createdAt: 'asc' } })
    return NextResponse.json({ memos: memos.map(serializeMemo) }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/expenses/sessions/[id]/memos]', err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
