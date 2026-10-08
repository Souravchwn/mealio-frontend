/** GET /api/platform/stats — numbers for the console dashboard. */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePlatformAdmin } from '@/lib/platform-auth'

const DAY = 24 * 60 * 60 * 1000

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAdmin(req)
  if (auth.error) return auth.error

  try {
    const now = Date.now()
    const since7 = new Date(now - 7 * DAY)
    const since1 = new Date(now - DAY)

    const [
      messesTotal, messesActive, messesSuspended, messesDeleted, messesNew7,
      membersTotal, membersPending, membersNew7, activeToday,
      ticketsOpen, ticketsHigh, failedLogins24, highEvents24, recentMesses, recentEvents,
    ] = await Promise.all([
      prisma.mess.count(),
      prisma.mess.count({ where: { isActive: true, suspendedAt: null, deletedAt: null } }),
      prisma.mess.count({ where: { suspendedAt: { not: null }, deletedAt: null } }),
      prisma.mess.count({ where: { deletedAt: { not: null } } }),
      prisma.mess.count({ where: { createdAt: { gte: since7 } } }),
      prisma.member.count({ where: { deletedAt: null, joinStatus: 'APPROVED' } }),
      prisma.member.count({ where: { joinStatus: 'PENDING', deletedAt: null } }),
      prisma.member.count({ where: { joinedAt: { gte: since7 }, deletedAt: null } }),
      prisma.member.count({ where: { lastLoginAt: { gte: since1 } } }),
      prisma.supportTicket.count({ where: { status: { in: ['OPEN', 'WAITING_ON_USER'] } } }),
      prisma.supportTicket.count({ where: { status: 'OPEN', priority: 'HIGH' } }),
      prisma.securityEvent.count({ where: { type: { in: ['LOGIN_FAILED', 'PLATFORM_LOGIN_FAILED'] }, createdAt: { gte: since1 } } }),
      prisma.securityEvent.count({ where: { severity: 'HIGH', createdAt: { gte: since1 } } }),
      prisma.mess.findMany({
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: { id: true, name: true, createdAt: true, plan: true, _count: { select: { members: true } } },
      }),
      prisma.securityEvent.findMany({
        where: { severity: { in: ['WARN', 'HIGH'] } },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: { id: true, type: true, severity: true, email: true, ip: true, createdAt: true },
      }),
    ])

    // Sign-ups per day for the last 14 days (members and messes)
    const since14 = new Date(now - 14 * DAY)
    const [memberDays, messDays] = await Promise.all([
      prisma.member.findMany({ where: { joinedAt: { gte: since14 } }, select: { joinedAt: true } }),
      prisma.mess.findMany({ where: { createdAt: { gte: since14 } }, select: { createdAt: true } }),
    ])
    const series = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(now - (13 - i) * DAY).toISOString().slice(0, 10)
      return {
        date: d,
        members: memberDays.filter((m) => m.joinedAt.toISOString().slice(0, 10) === d).length,
        messes: messDays.filter((m) => m.createdAt.toISOString().slice(0, 10) === d).length,
      }
    })

    return NextResponse.json({
      messes: { total: messesTotal, active: messesActive, suspended: messesSuspended, deleted: messesDeleted, new_this_week: messesNew7 },
      members: { total: membersTotal, pending: membersPending, new_this_week: membersNew7, active_today: activeToday },
      support: { open: ticketsOpen, high: ticketsHigh },
      security: { failed_logins_day: failedLogins24, high_events_day: highEvents24 },
      signups: series,
      recent_messes: recentMesses.map((m) => ({
        id: m.id, name: m.name, plan: m.plan, members: m._count.members, created_at: m.createdAt.toISOString(),
      })),
      recent_events: recentEvents.map((e) => ({ ...e, created_at: e.createdAt.toISOString(), createdAt: undefined })),
    })
  } catch (err) {
    console.error('[GET /api/platform/stats]', err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
