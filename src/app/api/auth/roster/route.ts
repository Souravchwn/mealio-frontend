/**
 * GET /api/auth/roster?code=MESS-XXXX — public.
 *
 * When someone joins with the mess invite code, they pick their name from the members the
 * admin added by name who have not joined yet. Only those names are returned (no balances,
 * no contact details), and only with a valid code. Rate limited per IP.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { clientIp } from '@/lib/auth-utils'
import { checkRateLimit } from '@/lib/rate-limit'
import { logSecurityEvent } from '@/lib/security-events'

export async function GET(req: NextRequest) {
  const ip = clientIp(req)
  const rate = await checkRateLimit('roster-ip', ip, 20, 10 * 60 * 1000)
  if (!rate.allowed) return NextResponse.json({ detail: 'Too many attempts. Try again later.' }, { status: 429 })

  const code = (new URL(req.url).searchParams.get('code') ?? '').toUpperCase().trim()
  if (!/^[A-Z0-9-]{4,20}$/.test(code)) {
    return NextResponse.json({ detail: 'Enter the invite code from your mess admin' }, { status: 400 })
  }

  try {
    const mess = await prisma.mess.findFirst({
      where: { inviteCode: code, isActive: true, deletedAt: null, suspendedAt: null },
      select: { id: true, name: true },
    })
    if (!mess) {
      await logSecurityEvent({ type: 'INVITE_CODE_INVALID', severity: 'WARN', ip, detail: { route: 'roster' } })
      return NextResponse.json({ detail: 'That invite code does not work. Check it with your mess admin.', code: 'INVALID_CODE' }, { status: 400 })
    }
    const names = await prisma.member.findMany({
      where: {
        messId: mess.id,
        passwordHash: null,
        isActive: true,
        deletedAt: null,
        // Hide names someone has already asked for
        claims: { none: { status: 'PENDING' } },
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json({ mess_name: mess.name, names: names.map((n) => ({ id: n.id, name: n.name })) })
  } catch (err) {
    console.error('[GET /api/auth/roster]', err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
