/**
 * GET /api/platform/audit?source=platform|mess&mess_id=&page=
 *   platform → what platform admins did
 *   mess     → mess-level audit trail across every mess (or one mess)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePlatformAdmin } from '@/lib/platform-auth'

const PAGE_SIZE = 50

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAdmin(req)
  if (auth.error) return auth.error

  const sp = new URL(req.url).searchParams
  const source = sp.get('source') === 'mess' ? 'mess' : 'platform'
  const messId = sp.get('mess_id') || undefined
  const page = Math.max(1, Number(sp.get('page')) || 1)

  try {
    if (source === 'platform') {
      const [total, rows, admins] = await Promise.all([
        prisma.platformAuditLog.count(),
        prisma.platformAuditLog.findMany({ orderBy: { createdAt: 'desc' }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
        prisma.platformAdmin.findMany({ select: { id: true, name: true } }),
      ])
      const names = new Map(admins.map((a) => [a.id, a.name]))
      return NextResponse.json({
        total,
        page,
        pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
        entries: rows.map((r) => ({
          id: r.id,
          actor: r.adminId ? names.get(r.adminId) ?? 'Removed admin' : 'System',
          action: r.action,
          target: r.targetType ? `${r.targetType}:${r.targetId}` : null,
          detail: r.detail,
          created_at: r.createdAt.toISOString(),
        })),
      })
    }

    const where = messId ? { messId } : {}
    const [total, rows] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { actor: { select: { name: true } }, mess: { select: { id: true, name: true } } },
      }),
    ])
    return NextResponse.json({
      total,
      page,
      pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      entries: rows.map((r) => ({
        id: r.id,
        actor: r.actor?.name ?? 'System',
        action: r.action,
        mess: r.mess,
        target: r.targetTable,
        detail: r.newValue,
        created_at: r.createdAt.toISOString(),
      })),
    })
  } catch (err) {
    console.error('[GET /api/platform/audit]', err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
