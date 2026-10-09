import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'

// GET /api/mess — list all messes the current user belongs to
export async function GET(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  const [member, memberships] = await Promise.all([
    prisma.member.findUnique({ where: { id: payload.sub }, select: { messId: true, role: true } }),
    prisma.messMembership.findMany({
      where: { memberId: payload.sub, isActive: true },
      select: { messId: true, role: true },
    }),
  ])

  const messIds = new Set<string>()
  if (member?.messId) messIds.add(member.messId)
  for (const mb of memberships) messIds.add(mb.messId)

  if (messIds.size === 0) return NextResponse.json({ messes: [] })

  const messes = await prisma.mess.findMany({
    where: { id: { in: Array.from(messIds) }, isActive: true, deletedAt: null, suspendedAt: null },
    select: { id: true, name: true, inviteCode: true, cutOffTime: true, isActive: true },
  })

  const roleMap: Record<string, string> = {}
  for (const mb of memberships) roleMap[mb.messId] = mb.role
  if (member?.messId && !roleMap[member.messId]) roleMap[member.messId] = member.role

  return NextResponse.json({
    current_mess_id: payload.messId,
    messes: messes.map((mess) => {
      const role = roleMap[mess.id] ?? 'MEMBER'
      return {
        id: mess.id,
        name: mess.name,
        // The invite code lets anyone join — only admins and managers see it
        invite_code: role === 'ADMIN' || role === 'MANAGER' ? mess.inviteCode : null,
        cut_off_time: mess.cutOffTime.toISOString().slice(11, 16),
        is_current: mess.id === payload.messId,
        role,
      }
    }),
  })
}

// Creating a mess happens only at sign-up (POST /api/auth/register, mode "create").
