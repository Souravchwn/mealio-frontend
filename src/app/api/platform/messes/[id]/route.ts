/**
 * /api/platform/messes/[id]
 *   GET   — full detail: members, numbers, settings, recent activity
 *   PATCH { action, ... } — suspend | unsuspend | restore | delete | set_plan
 *                           | rotate_invite | set_join_approval
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePlatformAdmin, platformAudit } from '@/lib/platform-auth'
import { refreshMessSettings } from '@/lib/mess-settings'
import { uniqueInviteCode } from '@/lib/mess-create'
import { PLAN_KEYS, type PlanKey } from '@/lib/plans'
import { calculatePeriodSummary } from '@/lib/financial'
import { getCurrentPeriod } from '@/lib/period'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Ctx) {
  const auth = await requirePlatformAdmin(req)
  if (auth.error) return auth.error
  const { id } = await params

  try {
    const mess = await prisma.mess.findUnique({
      where: { id },
      include: {
        members: {
          select: {
            id: true, name: true, email: true, phone: true, role: true, isActive: true, joinStatus: true,
            joinedAt: true, lastLoginAt: true, telegramLinked: true, emailVerifiedAt: true, deletedAt: true,
          },
          orderBy: { joinedAt: 'asc' },
        },
        telegramGroups: { where: { isActive: true }, select: { chatName: true, timezone: true } },
      },
    })
    if (!mess) return NextResponse.json({ detail: 'Mess not found' }, { status: 404 })

    const [audit, tickets, period] = await Promise.all([
      prisma.auditLog.findMany({
        where: { messId: id },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, action: true, createdAt: true, actor: { select: { name: true } } },
      }),
      prisma.supportTicket.findMany({
        where: { messId: id },
        orderBy: { updatedAt: 'desc' },
        take: 10,
        select: { id: true, subject: true, status: true, updatedAt: true },
      }),
      getCurrentPeriod(id),
    ])
    let money: { meal_rate: number; total_expense: number; total_meals: number } | null = null
    if (period && !mess.deletedAt) {
      const s = await calculatePeriodSummary(id, { ...period, start: period.startDate, end: period.endDate })
      money = { meal_rate: s.mealRate, total_expense: s.totalExpense, total_meals: s.totalMeals }
    }

    return NextResponse.json({
      id: mess.id,
      name: mess.name,
      invite_code: mess.inviteCode,
      plan: mess.plan,
      plan_expires_at: mess.planExpiresAt?.toISOString() ?? null,
      require_join_approval: mess.requireJoinApproval,
      owner_id: mess.ownerId,
      status: mess.deletedAt ? 'DELETED' : mess.suspendedAt ? 'SUSPENDED' : mess.isActive ? 'ACTIVE' : 'INACTIVE',
      suspended_reason: mess.suspendedReason,
      suspended_at: mess.suspendedAt?.toISOString() ?? null,
      deleted_at: mess.deletedAt?.toISOString() ?? null,
      created_at: mess.createdAt.toISOString(),
      telegram_group: mess.telegramGroups[0] ?? null,
      period: period ? { label: period.yearMonth, start: period.startDate.toISOString().slice(0, 10), end: period.endDate.toISOString().slice(0, 10) } : null,
      money,
      members: mess.members.map((m) => ({
        id: m.id, name: m.name, email: m.email, phone: m.phone, role: m.role,
        is_active: m.isActive, join_status: m.joinStatus, deleted: !!m.deletedAt,
        telegram_linked: m.telegramLinked, email_verified: !!m.emailVerifiedAt,
        joined_at: m.joinedAt.toISOString(), last_login_at: m.lastLoginAt?.toISOString() ?? null,
      })),
      recent_activity: audit.map((a) => ({ id: a.id, action: a.action, actor: a.actor?.name ?? 'System', created_at: a.createdAt.toISOString() })),
      tickets: tickets.map((t) => ({ id: t.id, subject: t.subject, status: t.status, updated_at: t.updatedAt.toISOString() })),
    })
  } catch (err) {
    console.error('[GET /api/platform/messes/%s]', id, err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requirePlatformAdmin(req)
  if (auth.error) return auth.error
  const { id } = await params

  let body: { action?: unknown; reason?: unknown; plan?: unknown; value?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ detail: 'Invalid request body' }, { status: 400 })
  }

  try {
    const mess = await prisma.mess.findUnique({ where: { id }, select: { id: true, deletedAt: true } })
    if (!mess) return NextResponse.json({ detail: 'Mess not found' }, { status: 404 })
    let result: Record<string, unknown> = { ok: true }

    switch (body.action) {
      case 'suspend': {
        const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 300) : ''
        if (!reason) return NextResponse.json({ detail: 'Give a reason for suspending.' }, { status: 400 })
        await prisma.mess.update({ where: { id }, data: { suspendedAt: new Date(), suspendedReason: reason } })
        break
      }
      case 'unsuspend':
        await prisma.mess.update({ where: { id }, data: { suspendedAt: null, suspendedReason: null } })
        break
      case 'restore':
        await prisma.mess.update({ where: { id }, data: { deletedAt: null, isActive: true } })
        break
      case 'delete':
        await prisma.mess.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } })
        break
      case 'set_plan': {
        if (!PLAN_KEYS.includes(body.plan as PlanKey)) {
          return NextResponse.json({ detail: `Plan must be one of ${PLAN_KEYS.join(', ')}` }, { status: 400 })
        }
        await prisma.mess.update({ where: { id }, data: { plan: body.plan as string } })
        break
      }
      case 'rotate_invite': {
        const code = await uniqueInviteCode()
        await prisma.mess.update({ where: { id }, data: { inviteCode: code } })
        result = { ok: true, invite_code: code }
        break
      }
      case 'set_join_approval':
        if (typeof body.value !== 'boolean') return NextResponse.json({ detail: 'value must be true or false' }, { status: 400 })
        await prisma.mess.update({ where: { id }, data: { requireJoinApproval: body.value } })
        break
      default:
        return NextResponse.json({ detail: 'Unknown action' }, { status: 400 })
    }

    await refreshMessSettings(id)
    await platformAudit(auth.admin.id, `MESS_${String(body.action).toUpperCase()}`, 'mess', id, {
      reason: typeof body.reason === 'string' ? body.reason : null,
      plan: typeof body.plan === 'string' ? body.plan : null,
      value: typeof body.value === 'boolean' ? body.value : null,
    })
    return NextResponse.json(result)
  } catch (err) {
    console.error('[PATCH /api/platform/messes/%s]', id, err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
