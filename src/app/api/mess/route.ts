import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = 'MESS-'
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

// GET /api/mess — list all messes the current user belongs to
export async function GET(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  const [member, memberships] = await Promise.all([
    prisma.member.findUnique({ where: { id: payload.sub }, select: { messId: true } }),
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
    where: { id: { in: Array.from(messIds) }, isActive: true },
    select: { id: true, name: true, inviteCode: true, cutOffTime: true, isActive: true },
  })

  const roleMap: Record<string, string> = {}
  for (const mb of memberships) roleMap[mb.messId] = mb.role
  if (member?.messId && !roleMap[member.messId]) roleMap[member.messId] = payload.role

  return NextResponse.json({
    current_mess_id: payload.messId,
    messes: messes.map((mess) => ({
      id: mess.id,
      name: mess.name,
      invite_code: mess.inviteCode,
      cut_off_time: mess.cutOffTime.toISOString().slice(11, 16),
      is_current: mess.id === payload.messId,
      role: roleMap[mess.id] ?? 'MEMBER',
    })),
  })
}

// POST /api/mess — create a new mess
export async function POST(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  const { name, estimated_monthly_budget, cut_off_time } = await req.json()

  if (!name) {
    return NextResponse.json({ detail: 'Mess name is required' }, { status: 400 })
  }

  // Generate a unique invite code (retry up to 5 times on collision)
  let inviteCode = generateInviteCode()
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await prisma.mess.findFirst({ where: { inviteCode }, select: { id: true } })
    if (!existing) break
    inviteCode = generateInviteCode()
  }

  // Parse cut_off_time string ('21:00') into a Date for the TIME column
  const rawTime = (cut_off_time as string | undefined) || '21:00'
  const cutOffTimeDate = new Date(`1970-01-01T${rawTime}:00.000Z`)

  try {
    const mess = await prisma.mess.create({
      data: {
        name: (name as string).trim(),
        inviteCode,
        cutOffTime: cutOffTimeDate,
        estimatedMonthlyBudget: estimated_monthly_budget ?? null,
        isActive: true,
      },
      select: { id: true, name: true, inviteCode: true, cutOffTime: true },
    })

    await prisma.messMembership.create({
      data: { memberId: payload.sub, messId: mess.id, role: 'ADMIN', isActive: true },
    })

    return NextResponse.json({
      id: mess.id,
      name: mess.name,
      invite_code: mess.inviteCode,
      cut_off_time: mess.cutOffTime.toISOString().slice(11, 16),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create mess'
    return NextResponse.json({ detail: msg }, { status: 500 })
  }
}
