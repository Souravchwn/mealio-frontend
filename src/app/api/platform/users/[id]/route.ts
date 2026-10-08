/**
 * /api/platform/users/[id]
 *   GET   — profile, mess, recent security events, tickets
 *   PATCH { action, ... } — deactivate | reactivate | verify_email | change_email
 *                           | reset_code | unlink_telegram | sign_out_everywhere
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePlatformAdmin, platformAudit } from '@/lib/platform-auth'
import { issueResetCode, RESET_CODE_TTL_MINUTES } from '@/lib/account-emails'
import { invalidateDailyLogsMarker, settleDailyLogs, recordInactiveGap } from '@/lib/daily-logs'

type Ctx = { params: Promise<{ id: string }> }
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export async function GET(req: NextRequest, { params }: Ctx) {
  const auth = await requirePlatformAdmin(req)
  if (auth.error) return auth.error
  const { id } = await params

  try {
    const user = await prisma.member.findUnique({
      where: { id },
      select: {
        id: true, name: true, email: true, phone: true, role: true, isActive: true, joinStatus: true,
        deletedAt: true, emailVerifiedAt: true, lastLoginAt: true, joinedAt: true, telegramLinked: true,
        passwordChangedAt: true, mess: { select: { id: true, name: true } },
      },
    })
    if (!user) return NextResponse.json({ detail: 'User not found' }, { status: 404 })

    const [events, tickets] = await Promise.all([
      prisma.securityEvent.findMany({
        where: { OR: [{ memberId: id }, { email: user.email }] },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: { id: true, type: true, severity: true, ip: true, createdAt: true },
      }),
      prisma.supportTicket.findMany({
        where: { OR: [{ memberId: id }, { email: user.email }] },
        orderBy: { updatedAt: 'desc' },
        take: 10,
        select: { id: true, subject: true, status: true, updatedAt: true },
      }),
    ])

    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.deletedAt ? 'DELETED' : user.joinStatus !== 'APPROVED' ? user.joinStatus : user.isActive ? 'ACTIVE' : 'INACTIVE',
      email_verified: !!user.emailVerifiedAt,
      telegram_linked: user.telegramLinked,
      mess: user.mess,
      joined_at: user.joinedAt.toISOString(),
      last_login_at: user.lastLoginAt?.toISOString() ?? null,
      password_changed_at: user.passwordChangedAt?.toISOString() ?? null,
      events: events.map((e) => ({ id: e.id, type: e.type, severity: e.severity, ip: e.ip, created_at: e.createdAt.toISOString() })),
      tickets: tickets.map((t) => ({ id: t.id, subject: t.subject, status: t.status, updated_at: t.updatedAt.toISOString() })),
    })
  } catch (err) {
    console.error('[GET /api/platform/users/%s]', id, err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requirePlatformAdmin(req)
  if (auth.error) return auth.error
  const { id } = await params

  let body: { action?: unknown; email?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ detail: 'Invalid request body' }, { status: 400 })
  }

  try {
    const user = await prisma.member.findUnique({
      where: { id },
      select: { id: true, messId: true, isActive: true, deletedAt: true, email: true },
    })
    if (!user) return NextResponse.json({ detail: 'User not found' }, { status: 404 })
    if (user.deletedAt) return NextResponse.json({ detail: 'This account was deleted by its owner.' }, { status: 400 })
    let result: Record<string, unknown> = { ok: true }

    switch (body.action) {
      case 'deactivate':
        if (user.messId) await settleDailyLogs(user.messId)
        await prisma.member.update({ where: { id }, data: { isActive: false } })
        if (user.messId) await invalidateDailyLogsMarker(user.messId)
        break
      case 'reactivate':
        if (user.messId) await settleDailyLogs(user.messId)
        await prisma.member.update({ where: { id }, data: { isActive: true, joinStatus: 'APPROVED' } })
        if (user.messId && !user.isActive) await recordInactiveGap(user.messId, id)
        if (user.messId) await invalidateDailyLogsMarker(user.messId)
        break
      case 'verify_email':
        await prisma.member.update({ where: { id }, data: { emailVerifiedAt: new Date() } })
        break
      case 'change_email': {
        const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
        if (!EMAIL_RE.test(email)) return NextResponse.json({ detail: 'Enter a valid email.' }, { status: 400 })
        const taken = await prisma.member.findUnique({ where: { email }, select: { id: true } })
        if (taken && taken.id !== id) return NextResponse.json({ detail: 'Another account already uses that email.' }, { status: 400 })
        await prisma.member.update({ where: { id }, data: { email, emailVerifiedAt: null } })
        break
      }
      case 'reset_code': {
        const { code, expiresAt } = await issueResetCode(id, `PLATFORM:${auth.admin.id}`)
        result = { ok: true, code, email: user.email, expires_at: expiresAt.toISOString(), minutes: RESET_CODE_TTL_MINUTES }
        break
      }
      case 'unlink_telegram':
        await prisma.member.update({ where: { id }, data: { telegramUid: null, telegramLinked: false } })
        break
      case 'sign_out_everywhere':
        await prisma.member.update({ where: { id }, data: { passwordChangedAt: new Date() } })
        break
      default:
        return NextResponse.json({ detail: 'Unknown action' }, { status: 400 })
    }

    await platformAudit(auth.admin.id, `USER_${String(body.action).toUpperCase()}`, 'member', id, {
      email: body.action === 'change_email' ? { from: user.email, to: body.email as string } : null,
    })
    return NextResponse.json(result)
  } catch (err) {
    console.error('[PATCH /api/platform/users/%s]', id, err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
