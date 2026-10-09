/**
 * POST /api/mess/delete { confirm_name, password } (ADMIN only)
 * Soft delete: everyone loses access at once. The platform team can restore
 * it within 30 days; after that it can be purged from the console.
 */

import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken, clientIp } from '@/lib/auth-utils'
import { createAudit } from '@/lib/audit'
import { logSecurityEvent } from '@/lib/security-events'

export async function POST(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'ADMIN') return NextResponse.json({ detail: 'Admin access required' }, { status: 403 })

  let body: { confirm_name?: unknown; password?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ detail: 'Invalid request body' }, { status: 400 })
  }

  try {
    const [mess, me] = await Promise.all([
      prisma.mess.findUnique({ where: { id: payload.messId }, select: { name: true } }),
      prisma.member.findUnique({ where: { id: payload.sub }, select: { passwordHash: true } }),
    ])
    if (!mess || !me) return NextResponse.json({ detail: 'Mess not found' }, { status: 404 })
    if (typeof body.confirm_name !== 'string' || body.confirm_name.trim() !== mess.name.trim()) {
      return NextResponse.json({ detail: 'Type the mess name exactly to confirm.' }, { status: 400 })
    }
    if (typeof body.password !== 'string' || !me.passwordHash || !(await bcrypt.compare(body.password, me.passwordHash))) {
      return NextResponse.json({ detail: 'Your password is not correct.' }, { status: 400 })
    }

    await prisma.mess.update({ where: { id: payload.messId }, data: { deletedAt: new Date(), isActive: false } })
    await createAudit({
      messId: payload.messId,
      actorId: payload.sub,
      action: 'ADMIN_SETTINGS_UPDATE',
      targetTable: 'messes',
      targetId: payload.messId,
      newValue: { deleted: true },
    })
    await logSecurityEvent({ type: 'MESS_DELETED', severity: 'WARN', messId: payload.messId, memberId: payload.sub, ip: clientIp(req) })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[POST /api/mess/delete]', err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
