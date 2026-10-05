import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { signToken, clientIp } from '@/lib/auth-utils'
import { checkLoginRateLimit } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  let body: { email?: unknown; password?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ detail: 'Invalid request body' }, { status: 400 })
  }
  const { email, password } = body

  if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
    return NextResponse.json({ detail: 'Email and password are required' }, { status: 400 })
  }

  // Rate limiting — per IP and per email, shared across instances via Redis
  const rateCheck = await checkLoginRateLimit(clientIp(req), email)
  if (!rateCheck.allowed) {
    const retryAfterSecs = Math.ceil((rateCheck.retryAfterMs ?? 0) / 1000)
    return NextResponse.json(
      { detail: `Too many login attempts. Try again in ${retryAfterSecs}s.` },
      { status: 429, headers: { 'Retry-After': String(retryAfterSecs) } },
    )
  }

  try {
    const member = await prisma.member.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { id: true, name: true, email: true, role: true, messId: true, passwordHash: true, isActive: true },
    })

    // Same response for unknown email and wrong password — no account enumeration
    const valid = member ? await bcrypt.compare(password, member.passwordHash) : false
    if (!member || !valid) {
      return NextResponse.json({ detail: 'Invalid email or password' }, { status: 401 })
    }

    if (!member.isActive) {
      return NextResponse.json({ detail: 'Account is deactivated' }, { status: 401 })
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
  } catch (err) {
    console.error('[POST /api/auth/login]', err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
