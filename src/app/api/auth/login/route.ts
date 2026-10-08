import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { signToken, clientIp } from '@/lib/auth-utils'
import { isLoginBlocked, recordLoginFailure, clearLoginFailures } from '@/lib/rate-limit'
import { logSecurityEvent } from '@/lib/security-events'

// A real hash so unknown emails take as long as wrong passwords (no timing leak)
const DUMMY_HASH = bcrypt.hashSync('mealio-timing-guard', 10)

export async function POST(req: NextRequest) {
  let body: { email?: unknown; password?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ detail: 'Invalid request body' }, { status: 400 })
  }
  const { email, password } = body
  const ip = clientIp(req)

  if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
    return NextResponse.json({ detail: 'Email and password are required' }, { status: 400 })
  }
  const normEmail = email.toLowerCase().trim()

  const rateCheck = await isLoginBlocked(ip, normEmail)
  if (!rateCheck.allowed) {
    await logSecurityEvent({ type: 'RATE_LIMITED', severity: 'WARN', email: normEmail, ip, detail: { route: 'login' } })
    const retryAfterSecs = Math.ceil((rateCheck.retryAfterMs ?? 0) / 1000)
    return NextResponse.json(
      { detail: `Too many login attempts. Try again in ${retryAfterSecs}s.`, code: 'RATE_LIMITED' },
      { status: 429, headers: { 'Retry-After': String(retryAfterSecs) } },
    )
  }

  try {
    const member = await prisma.member.findUnique({
      where: { email: normEmail },
      select: {
        id: true, name: true, email: true, role: true, messId: true, passwordHash: true, isActive: true,
        joinStatus: true, deletedAt: true,
        mess: { select: { name: true, isActive: true, suspendedAt: true, deletedAt: true } },
      },
    })

    const valid = await bcrypt.compare(password, member?.passwordHash ?? DUMMY_HASH)
    if (!member || !valid || member.deletedAt) {
      await recordLoginFailure(ip, normEmail)
      await logSecurityEvent({ type: 'LOGIN_FAILED', severity: 'WARN', email: normEmail, ip, memberId: member?.id ?? null })
      return NextResponse.json({ detail: 'Invalid email or password', code: 'INVALID_CREDENTIALS' }, { status: 401 })
    }

    // Password is right from here on, so it is safe to say why access is blocked
    const blocked = (code: string, detail: string) => {
      void logSecurityEvent({ type: 'LOGIN_BLOCKED', email: normEmail, ip, memberId: member.id, messId: member.messId, detail: { code } })
      return NextResponse.json({ detail, code }, { status: 403 })
    }

    if (member.joinStatus === 'PENDING') {
      return blocked('PENDING_APPROVAL', `Your request to join ${member.mess?.name ?? 'the mess'} is waiting for the admin's approval.`)
    }
    if (member.joinStatus === 'REJECTED') {
      return blocked('JOIN_REJECTED', 'The mess admin did not approve your request to join.')
    }
    if (!member.isActive) {
      return blocked('ACCOUNT_INACTIVE', 'You have been removed from this mess. Ask the admin to add you back.')
    }
    if (!member.messId || !member.mess) {
      return blocked('NO_MESS', 'Your account is not part of a mess.')
    }
    if (member.mess.deletedAt) {
      return blocked('MESS_DELETED', 'This mess was deleted. Contact support within 30 days if you want it restored.')
    }
    if (member.mess.suspendedAt || !member.mess.isActive) {
      return blocked('MESS_SUSPENDED', 'This mess is suspended. Contact support for help.')
    }

    await clearLoginFailures(normEmail)
    const token = await signToken({ sub: member.id, messId: member.messId, role: member.role })
    await prisma.member.update({ where: { id: member.id }, data: { lastLoginAt: new Date() } })
    await logSecurityEvent({ type: 'LOGIN_OK', email: normEmail, ip, memberId: member.id, messId: member.messId })

    return NextResponse.json({
      access_token: token,
      refresh_token: token,
      user: {
        id: member.id,
        name: member.name,
        email: member.email,
        role: member.role,
        mess_id: member.messId,
        mess_name: member.mess.name,
      },
    })
  } catch (err) {
    console.error('[POST /api/auth/login]', err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
