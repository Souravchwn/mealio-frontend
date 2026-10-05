import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { signToken, clientIp } from '@/lib/auth-utils'
import { checkRateLimit } from '@/lib/rate-limit'
import { invalidateDailyLogsMarker } from '@/lib/daily-logs'

/** 10 registration attempts per hour per IP — stops invite-code guessing */
const REGISTER_MAX_ATTEMPTS = 10
const REGISTER_WINDOW_MS = 60 * 60 * 1000

export async function POST(req: NextRequest) {
  const rateCheck = await checkRateLimit('register-ip', clientIp(req), REGISTER_MAX_ATTEMPTS, REGISTER_WINDOW_MS)
  if (!rateCheck.allowed) {
    const retryAfterSecs = Math.ceil((rateCheck.retryAfterMs ?? 0) / 1000)
    return NextResponse.json(
      { detail: `Too many attempts. Try again in ${retryAfterSecs}s.` },
      { status: 429, headers: { 'Retry-After': String(retryAfterSecs) } },
    )
  }

  try {
    const { name, email, phone, password, mess_invite_code } = await req.json()

    if (
      typeof name !== 'string' || !name.trim() ||
      typeof email !== 'string' || !email.trim() ||
      typeof password !== 'string' ||
      typeof mess_invite_code !== 'string' || !mess_invite_code.trim()
    ) {
      return NextResponse.json({ detail: 'Name, email, password and invite code are required' }, { status: 400 })
    }

    if (password.length < 8) {
      return NextResponse.json({ detail: 'Password must be at least 8 characters' }, { status: 400 })
    }

    const mess = await prisma.mess.findFirst({
      where: { inviteCode: mess_invite_code.toUpperCase().trim(), isActive: true },
      select: { id: true, name: true },
    })

    if (!mess) {
      return NextResponse.json({ detail: 'Invalid mess invite code' }, { status: 400 })
    }

    const existing = await prisma.member.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { id: true },
    })

    if (existing) {
      return NextResponse.json({ detail: 'Email already registered' }, { status: 400 })
    }

    // Only bootstrap an ADMIN when the mess truly has nobody yet — a mess created
    // from the web app records its creator in mess_memberships, not members.mess_id.
    const [memberCount, membershipCount] = await Promise.all([
      prisma.member.count({ where: { messId: mess.id, isActive: true } }),
      prisma.messMembership.count({ where: { messId: mess.id, isActive: true } }),
    ])
    const role = memberCount === 0 && membershipCount === 0 ? 'ADMIN' : 'MEMBER'
    const passwordHash = await bcrypt.hash(password, 10)

    const member = await prisma.member.create({
      data: {
        messId: mess.id,
        name: name.trim(),
        email: email.toLowerCase().trim(),
        phone: typeof phone === 'string' && phone.trim() ? phone.trim() : null,
        passwordHash,
        role,
        isActive: true,
      },
      select: { id: true, name: true, email: true, role: true, messId: true },
    })

    await invalidateDailyLogsMarker(mess.id)

    const token = await signToken({ sub: member.id, messId: member.messId!, role: member.role })

    return NextResponse.json({
      access_token: token,
      refresh_token: token,
      user: {
        id: member.id,
        name: member.name,
        email: member.email,
        role: member.role,
        mess_id: member.messId,
        mess_name: mess.name,
      },
    })
  } catch (err) {
    console.error('[POST /api/auth/register]', err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
