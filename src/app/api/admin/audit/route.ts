import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'

/**
 * GET /api/admin/audit
 * Returns paginated audit log entries for the current mess.
 * Query params: page (default 1), limit (default 30), action (optional filter)
 */
export async function GET(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  if (payload.role !== 'ADMIN') {
    return NextResponse.json({ detail: 'Admin access required' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '30', 10)))
  const action = searchParams.get('action') ?? undefined

  const where = {
    messId: payload.messId,
    ...(action ? { action } : {}),
  }

  const [total, entries] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        action: true,
        targetTable: true,
        targetId: true,
        oldValue: true,
        newValue: true,
        createdAt: true,
        actor: { select: { name: true } },
      },
    }),
  ])

  return NextResponse.json({
    entries: entries.map((e) => ({
      id: e.id,
      actor_name: e.actor?.name ?? 'System',
      action: e.action,
      target_table: e.targetTable,
      target_id: e.targetId,
      old_value: e.oldValue,
      new_value: e.newValue,
      created_at: e.createdAt.toISOString(),
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
  })
}
