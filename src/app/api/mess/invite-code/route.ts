/**
 * POST /api/mess/invite-code (ADMIN only): replace the invite code.
 * The old code stops working at once, so a leaked code can be shut off.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { createAudit } from '@/lib/audit'
import { uniqueInviteCode } from '@/lib/mess-create'
import { logSecurityEvent } from '@/lib/security-events'

export async function POST(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'ADMIN') return NextResponse.json({ detail: 'Admin access required' }, { status: 403 })

  try {
    const inviteCode = await uniqueInviteCode()
    await prisma.mess.update({ where: { id: payload.messId }, data: { inviteCode } })
    await createAudit({
      messId: payload.messId,
      actorId: payload.sub,
      action: 'ADMIN_SETTINGS_UPDATE',
      targetTable: 'messes',
      targetId: payload.messId,
      newValue: { invite_code: 'rotated' },
    })
    await logSecurityEvent({ type: 'INVITE_CODE_ROTATED', messId: payload.messId, memberId: payload.sub })
    return NextResponse.json({ invite_code: inviteCode })
  } catch (err) {
    console.error('[POST /api/mess/invite-code]', err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
