/** GET /api/platform/tickets?status=open|all|OPEN|WAITING_ON_USER|RESOLVED|CLOSED&q=&page= */

import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requirePlatformAdmin } from '@/lib/platform-auth'
import { serializeTicket, TICKET_STATUSES } from '@/lib/support'

const PAGE_SIZE = 30
const RANK: Record<string, number> = { HIGH: 0, NORMAL: 1, LOW: 2 }

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAdmin(req)
  if (auth.error) return auth.error

  const sp = new URL(req.url).searchParams
  const status = sp.get('status') ?? 'open'
  const q = (sp.get('q') ?? '').trim()
  const page = Math.max(1, Number(sp.get('page')) || 1)

  const where: Prisma.SupportTicketWhereInput = {}
  if (status === 'open') where.status = { in: ['OPEN', 'WAITING_ON_USER'] }
  else if ((TICKET_STATUSES as readonly string[]).includes(status)) where.status = status
  if (q) {
    where.OR = [
      { subject: { contains: q, mode: 'insensitive' } },
      { email: { contains: q.toLowerCase() } },
      { name: { contains: q, mode: 'insensitive' } },
    ]
  }

  try {
    const [total, tickets] = await Promise.all([
      prisma.supportTicket.count({ where }),
      prisma.supportTicket.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    ])
    return NextResponse.json({
      total,
      page,
      pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      // High priority first within the page, newest activity first otherwise
      tickets: tickets
        .sort((a, b) => (RANK[a.priority] ?? 1) - (RANK[b.priority] ?? 1))
        .map((t) => serializeTicket(t)),
    })
  } catch (err) {
    console.error('[GET /api/platform/tickets]', err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
