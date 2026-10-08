/** GET /api/platform/users?q=&status=all|active|pending|inactive|deleted&page= */

import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requirePlatformAdmin } from '@/lib/platform-auth'

const PAGE_SIZE = 30

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAdmin(req)
  if (auth.error) return auth.error

  const sp = new URL(req.url).searchParams
  const q = (sp.get('q') ?? '').trim()
  const status = sp.get('status') ?? 'all'
  const page = Math.max(1, Number(sp.get('page')) || 1)

  const where: Prisma.MemberWhereInput = {}
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { email: { contains: q.toLowerCase() } },
      { phone: { contains: q } },
    ]
  }
  if (status === 'active') Object.assign(where, { isActive: true, deletedAt: null, joinStatus: 'APPROVED' })
  if (status === 'pending') Object.assign(where, { joinStatus: 'PENDING', deletedAt: null })
  if (status === 'inactive') Object.assign(where, { isActive: false, deletedAt: null, joinStatus: { not: 'PENDING' } })
  if (status === 'deleted') Object.assign(where, { deletedAt: { not: null } })

  try {
    const [total, users] = await Promise.all([
      prisma.member.count({ where }),
      prisma.member.findMany({
        where,
        orderBy: { joinedAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true, name: true, email: true, phone: true, role: true, isActive: true, joinStatus: true,
          deletedAt: true, emailVerifiedAt: true, lastLoginAt: true, joinedAt: true,
          mess: { select: { id: true, name: true } },
        },
      }),
    ])
    return NextResponse.json({
      total,
      page,
      pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        role: u.role,
        status: u.deletedAt ? 'DELETED' : u.joinStatus !== 'APPROVED' ? u.joinStatus : u.isActive ? 'ACTIVE' : 'INACTIVE',
        email_verified: !!u.emailVerifiedAt,
        mess: u.mess,
        last_login_at: u.lastLoginAt?.toISOString() ?? null,
        joined_at: u.joinedAt.toISOString(),
      })),
    })
  } catch (err) {
    console.error('[GET /api/platform/users]', err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
