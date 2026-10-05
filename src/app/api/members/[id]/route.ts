import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { createAuditTx } from '@/lib/audit'
import { ASSIGNABLE_ROLES } from '@/lib/constants'
import { invalidateDailyLogsMarker, recordInactiveGap, settleDailyLogs } from '@/lib/daily-logs'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  if (payload.role !== 'ADMIN') {
    return NextResponse.json({ detail: 'Admin access required' }, { status: 403 })
  }

  const { id } = await params

  const existing = await prisma.member.findFirst({
    where: { id, messId: payload.messId },
    select: { id: true, role: true, isActive: true, isGuest: true },
  })
  if (!existing) {
    return NextResponse.json({ detail: 'Member not found' }, { status: 404 })
  }

  if (id === payload.sub) {
    return NextResponse.json({ detail: 'You cannot modify your own role or status' }, { status: 400 })
  }

  let body: { role?: unknown; is_active?: unknown; guest_from?: unknown; guest_until?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ detail: 'Invalid request body' }, { status: 400 })
  }
  const { role, is_active, guest_from, guest_until } = body
  const updateData: Record<string, unknown> = {}

  if (role !== undefined) {
    if (!ASSIGNABLE_ROLES.includes(role as typeof ASSIGNABLE_ROLES[number])) {
      return NextResponse.json(
        { detail: `Invalid role. Must be one of: ${ASSIGNABLE_ROLES.join(', ')}` },
        { status: 400 },
      )
    }
    updateData.role = role
    updateData.isGuest = role === 'GUEST'
  }

  if (is_active !== undefined) {
    if (typeof is_active !== 'boolean') {
      return NextResponse.json({ detail: 'is_active must be true or false' }, { status: 400 })
    }
    updateData.isActive = is_active
  }

  for (const [field, value] of [['guestFrom', guest_from], ['guestUntil', guest_until]] as const) {
    if (value === undefined) continue
    if (value && (typeof value !== 'string' || !DATE_RE.test(value))) {
      return NextResponse.json({ detail: 'Guest dates must be YYYY-MM-DD' }, { status: 400 })
    }
    updateData[field] = value ? new Date(`${value as string}T00:00:00.000Z`) : null
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ detail: 'No fields to update' }, { status: 400 })
  }

  // Record every day so far under the member's CURRENT status first, so the
  // change (deactivate, guest dates, role) only affects days from now on
  await settleDailyLogs(payload.messId)
  const reactivating = updateData.isActive === true && !existing.isActive

  // Atomic: member update + audit log in one transaction
  try {
  await prisma.$transaction((tx) =>
    Promise.all([
      tx.member.update({ where: { id }, data: updateData }),
      createAuditTx(tx, {
        messId: payload.messId,
        actorId: payload.sub,
        action: 'ADMIN_MEMBER_UPDATE',
        targetTable: 'members',
        targetId: id,
        oldValue: { role: existing.role, isActive: existing.isActive },
        newValue: updateData as object,
      }),
    ]),
  )
  } catch (err) {
    console.error('[PUT /api/members/%s]', id, err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }

  // Days they were away count as 0 meals — not filled with their defaults
  if (reactivating) await recordInactiveGap(payload.messId, id)

  // Membership changed — today's auto-generated logs must be re-checked
  await invalidateDailyLogsMarker(payload.messId)

  return NextResponse.json({ ok: true })
}
