/** GET /api/platform/messes?q=&status=active|suspended|deleted|all&page= */

import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requirePlatformAdmin } from '@/lib/platform-auth'

const PAGE_SIZE = 25

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAdmin(req)
  if (auth.error) return auth.error

  const sp = new URL(req.url).searchParams
  const q = (sp.get('q') ?? '').trim()
  const status = sp.get('status') ?? 'all'
  const page = Math.max(1, Number(sp.get('page')) || 1)

  const where: Prisma.MessWhereInput = {}
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { inviteCode: { contains: q.toUpperCase() } },
      { members: { some: { email: { contains: q.toLowerCase() } } } },
    ]
  }
  if (status === 'active') Object.assign(where, { isActive: true, suspendedAt: null, deletedAt: null })
  if (status === 'suspended') Object.assign(where, { suspendedAt: { not: null }, deletedAt: null })
  if (status === 'deleted') Object.assign(where, { deletedAt: { not: null } })

  try {
    const [total, messes] = await Promise.all([
      prisma.mess.count({ where }),
      prisma.mess.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true, name: true, plan: true, createdAt: true, isActive: true, suspendedAt: true, deletedAt: true,
          ownerId: true,
          _count: { select: { members: { where: { isActive: true } } } },
        },
      }),
    ])
    const ownerIds = messes.map((m) => m.ownerId).filter((x): x is string => !!x)
    const owners = await prisma.member.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true, email: true } })
    const ownerMap = new Map(owners.map((o) => [o.id, o]))

    // Usage at a glance: last day anyone in the mess used it, and how many months it has closed
    const ids = messes.map((m) => m.id)
    const [lastActive, closed] = await Promise.all([
      prisma.memberActivity.groupBy({ by: ['messId'], where: { messId: { in: ids } }, _max: { day: true } }),
      prisma.messMonth.groupBy({ by: ['messId'], where: { messId: { in: ids }, isClosed: true }, _count: { _all: true } }),
    ])
    const lastActiveMap = new Map(lastActive.map((r) => [r.messId, r._max.day?.toISOString().slice(0, 10) ?? null]))
    const closedMap = new Map(closed.map((r) => [r.messId, r._count._all]))

    return NextResponse.json({
      total,
      page,
      pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      messes: messes.map((m) => ({
        id: m.id,
        name: m.name,
        plan: m.plan,
        members: m._count.members,
        status: m.deletedAt ? 'DELETED' : m.suspendedAt ? 'SUSPENDED' : m.isActive ? 'ACTIVE' : 'INACTIVE',
        owner: m.ownerId ? ownerMap.get(m.ownerId) ?? null : null,
        created_at: m.createdAt.toISOString(),
        last_active: lastActiveMap.get(m.id) ?? null,
        months_closed: closedMap.get(m.id) ?? 0,
      })),
    })
  } catch (err) {
    console.error('[GET /api/platform/messes]', err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
