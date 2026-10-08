/** GET /api/members/pending: join requests waiting for the admin (ADMIN only). */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'

export async function GET(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'ADMIN') return NextResponse.json({ detail: 'Admin access required' }, { status: 403 })

  try {
    const pending = await prisma.member.findMany({
      where: { messId: payload.messId, joinStatus: 'PENDING', deletedAt: null },
      select: { id: true, name: true, email: true, phone: true, joinedAt: true },
      orderBy: { joinedAt: 'asc' },
    })
    return NextResponse.json({
      pending: pending.map((m) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        phone: m.phone,
        requested_at: m.joinedAt.toISOString(),
      })),
    })
  } catch (err) {
    console.error('[GET /api/members/pending]', err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
