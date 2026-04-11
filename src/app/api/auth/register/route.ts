import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { signToken } from '@/lib/auth-utils'

export async function POST(req: NextRequest) {
  try {
    const { name, email, phone, password, mess_invite_code } = await req.json()

    if (!name || !email || !password || !mess_invite_code) {
      return NextResponse.json({ detail: 'Name, email, password and invite code are required' }, { status: 400 })
    }

    if (password.length < 8) {
      return NextResponse.json({ detail: 'Password must be at least 8 characters' }, { status: 400 })
    }

    const mess = await prisma.mess.findFirst({
      where: { inviteCode: (mess_invite_code as string).toUpperCase().trim(), isActive: true },
      select: { id: true, name: true },
    })

    if (!mess) {
      return NextResponse.json({ detail: 'Invalid mess invite code' }, { status: 400 })
    }

    const existing = await prisma.member.findUnique({
      where: { email: (email as string).toLowerCase().trim() },
      select: { id: true },
    })

    if (existing) {
      return NextResponse.json({ detail: 'Email already registered' }, { status: 400 })
    }

    const memberCount = await prisma.member.count({
      where: { messId: mess.id, isActive: true },
    })

    const role = memberCount === 0 ? 'ADMIN' : 'MEMBER'
    const passwordHash = await bcrypt.hash(password, 10)

    const member = await prisma.member.create({
      data: {
        messId: mess.id,
        name: (name as string).trim(),
        email: (email as string).toLowerCase().trim(),
        phone: phone ? (phone as string).trim() : null,
        passwordHash,
        role,
        isActive: true,
      },
      select: { id: true, name: true, email: true, role: true, messId: true },
    })

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
    const msg = err instanceof Error ? err.message : 'Failed to create account'
    return NextResponse.json({ detail: msg }, { status: 500 })
  }
}
