/**
 * POST /api/members/[id]/reset-code (ADMIN only)
 * Gives the admin a one-time code to pass to a locked-out member in person.
 * The member enters it on the reset-password screen with their email.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { checkRateLimit } from '@/lib/rate-limit'
import { createAudit } from '@/lib/audit'
import { issueResetCode, RESET_CODE_TTL_MINUTES } from '@/lib/account-emails'
import { logSecurityEvent } from '@/lib/security-events'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'ADMIN') return NextResponse.json({ detail: 'Admin access required' }, { status: 403 })

  const { id } = await params
  if (id === payload.sub) {
    return NextResponse.json({ detail: 'Change your own password in Settings instead.' }, { status: 400 })
  }

  const rate = await checkRateLimit('reset-code', payload.sub, 10, 60 * 60 * 1000)
  if (!rate.allowed) return NextResponse.json({ detail: 'Too many codes. Try again later.', code: 'RATE_LIMITED' }, { status: 429 })

  try {
    const member = await prisma.member.findFirst({
      where: { id, messId: payload.messId, deletedAt: null, joinStatus: 'APPROVED' },
      select: { id: true, name: true, email: true },
    })
    if (!member) return NextResponse.json({ detail: 'Member not found' }, { status: 404 })

    const { code, expiresAt } = await issueResetCode(member.id, `MESS_ADMIN:${payload.sub}`)
    await createAudit({
      messId: payload.messId,
      actorId: payload.sub,
      action: 'ADMIN_MEMBER_UPDATE',
      targetTable: 'members',
      targetId: member.id,
      newValue: { reset_code_issued: true },
    })
    await logSecurityEvent({ type: 'PASSWORD_RESET_CODE_ISSUED', memberId: member.id, messId: payload.messId, detail: { by: payload.sub } })
    return NextResponse.json({ code, email: member.email, expires_at: expiresAt.toISOString(), minutes: RESET_CODE_TTL_MINUTES })
  } catch (err) {
    console.error('[POST /api/members/%s/reset-code]', id, err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
