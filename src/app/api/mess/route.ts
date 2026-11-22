import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'

/**
 * GET /api/mess — the signed-in person's mess.
 *
 * Rule: one person belongs to exactly one mess (Member.messId). There is no switching and no
 * second mess. The list shape is kept for the pages that read the invite code from it.
 * Creating a mess happens only at sign-up (POST /api/auth/register, mode "create").
 */
export async function GET(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  try {
    const mess = await prisma.mess.findFirst({
      where: { id: payload.messId, isActive: true, deletedAt: null, suspendedAt: null },
      select: { id: true, name: true, inviteCode: true, cutOffTime: true },
    })
    if (!mess) return NextResponse.json({ current_mess_id: payload.messId, messes: [] })

    const privileged = payload.role === 'ADMIN' || payload.role === 'MANAGER'
    return NextResponse.json({
      current_mess_id: mess.id,
      messes: [
        {
          id: mess.id,
          name: mess.name,
          // The invite code lets anyone join: only admins and managers see it
          invite_code: privileged ? mess.inviteCode : null,
          cut_off_time: mess.cutOffTime.toISOString().slice(11, 16),
          is_current: true,
          role: payload.role,
        },
      ],
    })
  } catch (err) {
    console.error('[GET /api/mess]', err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
