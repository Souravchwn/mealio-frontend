/**
 * GET /api/platform/security-events?type=&severity=&q=&page=
 * Monitoring feed plus "hot spots": IPs and emails with the most failed
 * logins / blocked attempts in the last 24 hours.
 */

import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requirePlatformAdmin } from '@/lib/platform-auth'

const PAGE_SIZE = 50

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAdmin(req)
  if (auth.error) return auth.error

  const sp = new URL(req.url).searchParams
  const type = sp.get('type') ?? ''
  const severity = sp.get('severity') ?? ''
  const q = (sp.get('q') ?? '').trim()
  const page = Math.max(1, Number(sp.get('page')) || 1)

  const where: Prisma.SecurityEventWhereInput = {}
  if (type) where.type = type
  if (['INFO', 'WARN', 'HIGH'].includes(severity)) where.severity = severity
  if (q) where.OR = [{ email: { contains: q.toLowerCase() } }, { ip: { contains: q } }]

  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const suspicious = { createdAt: { gte: since }, type: { in: ['LOGIN_FAILED', 'RATE_LIMITED', 'INVITE_CODE_INVALID', 'PLATFORM_LOGIN_FAILED', 'PASSWORD_RESET_FAILED'] } }
    const [total, events, byIp, byEmail] = await Promise.all([
      prisma.securityEvent.count({ where }),
      prisma.securityEvent.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
      prisma.securityEvent.groupBy({
        by: ['ip'],
        where: { ...suspicious, ip: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { ip: 'desc' } },
        take: 8,
      }),
      prisma.securityEvent.groupBy({
        by: ['email'],
        where: { ...suspicious, email: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { email: 'desc' } },
        take: 8,
      }),
    ])

    return NextResponse.json({
      total,
      page,
      pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      events: events.map((e) => ({
        id: e.id, type: e.type, severity: e.severity, email: e.email, ip: e.ip,
        member_id: e.memberId, mess_id: e.messId, detail: e.detail, created_at: e.createdAt.toISOString(),
      })),
      hot_ips: byIp.map((r) => ({ ip: r.ip, count: r._count._all })),
      hot_emails: byEmail.map((r) => ({ email: r.email, count: r._count._all })),
    })
  } catch (err) {
    console.error('[GET /api/platform/security-events]', err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
