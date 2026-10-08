import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken, clientIp } from '@/lib/auth-utils'
import { refreshMessSettings } from '@/lib/mess-settings'
import { createMessRecord } from '@/lib/mess-create'
import { checkRateLimit } from '@/lib/rate-limit'
import { getPlan } from '@/lib/plans'
import { logSecurityEvent } from '@/lib/security-events'

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

// GET /api/mess — list all messes the current user belongs to
export async function GET(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  const [member, memberships] = await Promise.all([
    prisma.member.findUnique({ where: { id: payload.sub }, select: { messId: true, role: true } }),
    prisma.messMembership.findMany({
      where: { memberId: payload.sub, isActive: true },
      select: { messId: true, role: true },
    }),
  ])

  const messIds = new Set<string>()
  if (member?.messId) messIds.add(member.messId)
  for (const mb of memberships) messIds.add(mb.messId)

  if (messIds.size === 0) return NextResponse.json({ messes: [] })

  const messes = await prisma.mess.findMany({
    where: { id: { in: Array.from(messIds) }, isActive: true, deletedAt: null, suspendedAt: null },
    select: { id: true, name: true, inviteCode: true, cutOffTime: true, isActive: true },
  })

  const roleMap: Record<string, string> = {}
  for (const mb of memberships) roleMap[mb.messId] = mb.role
  if (member?.messId && !roleMap[member.messId]) roleMap[member.messId] = member.role

  return NextResponse.json({
    current_mess_id: payload.messId,
    messes: messes.map((mess) => {
      const role = roleMap[mess.id] ?? 'MEMBER'
      return {
        id: mess.id,
        name: mess.name,
        // The invite code lets anyone join — only admins and managers see it
        invite_code: role === 'ADMIN' || role === 'MANAGER' ? mess.inviteCode : null,
        cut_off_time: mess.cutOffTime.toISOString().slice(11, 16),
        is_current: mess.id === payload.messId,
        role,
      }
    }),
  })
}

// POST /api/mess: create another mess (the creator becomes its admin)
export async function POST(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  let body: { name?: unknown; estimated_monthly_budget?: unknown; cut_off_time?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ detail: 'Invalid request body' }, { status: 400 })
  }
  const { name, estimated_monthly_budget, cut_off_time } = body

  if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) {
    return NextResponse.json({ detail: 'Mess name is required' }, { status: 400 })
  }
  if (cut_off_time !== undefined && cut_off_time !== null && cut_off_time !== '' &&
      (typeof cut_off_time !== 'string' || !HHMM.test(cut_off_time))) {
    return NextResponse.json({ detail: 'Cut-off time must be HH:MM' }, { status: 400 })
  }
  const budget = estimated_monthly_budget === undefined || estimated_monthly_budget === null || estimated_monthly_budget === ''
    ? null
    : Number(estimated_monthly_budget)
  if (budget !== null && (isNaN(budget) || budget < 0)) {
    return NextResponse.json({ detail: 'Budget must be a positive number' }, { status: 400 })
  }

  const rate = await checkRateLimit('create-mess-member', payload.sub, 3, 24 * 60 * 60 * 1000)
  if (!rate.allowed) {
    await logSecurityEvent({ type: 'RATE_LIMITED', severity: 'WARN', memberId: payload.sub, ip: clientIp(req), detail: { route: 'mess:create' } })
    return NextResponse.json({ detail: 'You created too many messes today. Try again tomorrow.', code: 'RATE_LIMITED' }, { status: 429 })
  }

  try {
    // Cap on messes one person may own (by plan of their current mess)
    const current = await prisma.mess.findUnique({ where: { id: payload.messId }, select: { plan: true } })
    const owned = await prisma.mess.count({ where: { ownerId: payload.sub, deletedAt: null } })
    const limit = getPlan(current?.plan).maxOwnedMesses
    if (owned >= limit) {
      return NextResponse.json(
        { detail: `You can own up to ${limit} messes on the current plan.`, code: 'MESS_LIMIT' },
        { status: 400 },
      )
    }

    const mess = await prisma.$transaction(async (tx) => {
      const created = await createMessRecord(tx, {
        name,
        cutOffTime: (cut_off_time as string | undefined) || undefined,
        budget,
        ownerId: payload.sub,
      })
      await tx.messMembership.create({
        data: { memberId: payload.sub, messId: created.id, role: 'ADMIN', isActive: true },
      })
      return created
    })

    await refreshMessSettings(mess.id)
    await logSecurityEvent({ type: 'MESS_CREATED', memberId: payload.sub, messId: mess.id, ip: clientIp(req), detail: { name: mess.name } })

    return NextResponse.json({
      id: mess.id,
      name: mess.name,
      invite_code: mess.inviteCode,
      cut_off_time: mess.cutOffTime.toISOString().slice(11, 16),
    })
  } catch (err) {
    console.error('[POST /api/mess]', err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
