import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { signToken } from '@/lib/auth-utils'
import { getLoginRateLimiter } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  // Rate limiting — keyed by IP to prevent brute-force
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const limiter = getLoginRateLimiter()
  const rateCheck = limiter.check(ip)
  if (!rateCheck.allowed) {
    const retryAfterSecs = Math.ceil((rateCheck.retryAfterMs ?? 0) / 1000)
    return NextResponse.json(
      { detail: `Too many login attempts. Try again in ${retryAfterSecs}s.` },
      { status: 429, headers: { 'Retry-After': String(retryAfterSecs) } },
    )
  }

  try {
    const { email, password } = await req.json()

    if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
      return NextResponse.json({ detail: 'Email and password are required' }, { status: 400 })
    }

    const member = await prisma.member.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { id: true, name: true, email: true, role: true, messId: true, passwordHash: true, isActive: true },
    })

    if (!member) {
      return NextResponse.json({ detail: 'Invalid email or password' }, { status: 401 })
    }

    if (!member.isActive) {
      return NextResponse.json({ detail: 'Account is deactivated' }, { status: 401 })
    }

    const valid = await bcrypt.compare(password, member.passwordHash)
    if (!valid) {
      return NextResponse.json({ detail: 'Invalid email or password' }, { status: 401 })
    }

    if (!member.messId) {
      return NextResponse.json({ detail: 'Account is not assigned to a mess' }, { status: 403 })
    }

    const [mess, token] = await Promise.all([
      prisma.mess.findUnique({ where: { id: member.messId }, select: { name: true } }),
      signToken({ sub: member.id, messId: member.messId, role: member.role }),
    ])

    return NextResponse.json({
      access_token: token,
      refresh_token: token,
      user: {
        id: member.id,
        name: member.name,
        email: member.email,
        role: member.role,
        mess_id: member.messId,
        mess_name: mess?.name ?? '',
      },
    })
  } catch {
    return NextResponse.json({ detail: 'Internal server error' }, { status: 500 })
  }
}
