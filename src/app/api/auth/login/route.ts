import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { signToken } from '@/lib/auth-utils'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()

    if (!email || !password) {
      return NextResponse.json({ detail: 'Email and password are required' }, { status: 400 })
    }

    const member = await prisma.member.findUnique({
      where: { email: (email as string).toLowerCase().trim() },
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

    const mess = member.messId
      ? await prisma.mess.findUnique({ where: { id: member.messId }, select: { name: true } })
      : null

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
        mess_name: mess?.name ?? '',
      },
    })
  } catch {
    return NextResponse.json({ detail: 'Internal server error' }, { status: 500 })
  }
}
