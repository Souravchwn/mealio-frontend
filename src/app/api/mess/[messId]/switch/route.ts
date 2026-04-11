import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken, signToken } from '@/lib/auth-utils'

// GET /api/mess/[messId]/switch — switch active mess context → new JWT
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ messId: string }> }
) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  const { messId } = await params

  const [membership, member] = await Promise.all([
    prisma.messMembership.findFirst({
      where: { memberId: payload.sub, messId, isActive: true },
      select: { role: true },
    }),
    prisma.member.findUnique({
      where: { id: payload.sub },
      select: { messId: true, role: true },
    }),
  ])

  const isPrimaryMess = member?.messId === messId
  if (!membership && !isPrimaryMess) {
    return NextResponse.json({ detail: 'Access denied for this mess' }, { status: 403 })
  }

  const role = membership?.role ?? member?.role ?? payload.role

  const mess = await prisma.mess.findFirst({
    where: { id: messId, isActive: true },
    select: { id: true, name: true },
  })

  if (!mess) {
    return NextResponse.json({ detail: 'Mess not found' }, { status: 404 })
  }

  const newToken = await signToken({ sub: payload.sub, messId, role: role as string })

  return NextResponse.json({
    access_token: newToken,
    refresh_token: newToken,
    mess: { id: mess.id, name: mess.name },
  })
}
