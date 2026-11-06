/**
 * DELETE /api/announcements/[id] — Admin or Manager: take a broadcast down early.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { createAudit } from '@/lib/audit'

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  if (payload.role !== 'ADMIN' && payload.role !== 'MANAGER') {
    return NextResponse.json({ detail: 'Admin or Manager access required' }, { status: 403 })
  }

  const { id } = await params
  // A malformed id would make Postgres throw; it can only mean "not found"
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ detail: 'Broadcast not found' }, { status: 404 })
  }

  try {
    const found = await prisma.announcement.findUnique({ where: { id }, select: { messId: true, message: true } })
    // Another mess's broadcast looks exactly like a missing one
    if (!found || found.messId !== payload.messId) {
      return NextResponse.json({ detail: 'Broadcast not found' }, { status: 404 })
    }
    await prisma.announcement.delete({ where: { id } })
    await createAudit({
      messId: payload.messId,
      actorId: payload.sub,
      action: 'DELETE_ANNOUNCEMENT',
      targetTable: 'announcements',
      targetId: id,
      oldValue: { message: found.message },
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[DELETE /api/announcements/%s] messId=%s', id, payload.messId, err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
