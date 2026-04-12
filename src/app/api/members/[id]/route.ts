import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { createAuditTx } from '@/lib/audit'
import { VALID_ROLES } from '@/lib/constants'

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

  const { role, is_active, guest_from, guest_until } = await req.json()
  const updateData: Record<string, unknown> = {}

  if (role !== undefined) {
    if (!VALID_ROLES.includes(role as typeof VALID_ROLES[number])) {
      return NextResponse.json(
        { detail: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` },
        { status: 400 },
      )
    }
    updateData.role = role
    updateData.isGuest = role === 'GUEST'
  }

  if (is_active !== undefined) updateData.isActive = is_active

  if (guest_from !== undefined) {
    updateData.guestFrom = guest_from ? new Date(`${guest_from as string}T00:00:00.000Z`) : null
  }
  if (guest_until !== undefined) {
    updateData.guestUntil = guest_until ? new Date(`${guest_until as string}T00:00:00.000Z`) : null
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ detail: 'No fields to update' }, { status: 400 })
  }

  // Atomic: member update + audit log in one transaction
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

  return NextResponse.json({ ok: true })
}
