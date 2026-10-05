import { NextRequest, NextResponse } from 'next/server'
import { randomInt } from 'crypto'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { DEFAULT_CUTOFF_TIME, DEFAULT_MAX_MEAL_COUNT, DEFAULT_MEAL_CONFIGS } from '@/lib/constants'
import { refreshMessSettings } from '@/lib/mess-settings'

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

/** 8 chars from a 32-char alphabet ≈ 10^12 combinations, cryptographically random. */
function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = 'MESS-'
  for (let i = 0; i < 8; i++) {
    code += chars[randomInt(chars.length)]
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
    where: { id: { in: Array.from(messIds) }, isActive: true },
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

// POST /api/mess — create a new mess
export async function POST(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  let body: { name?: unknown; estimated_monthly_budget?: unknown; cut_off_time?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ detail: 'Invalid request body' }, { status: 400 })
  }
  const { name, estimated_monthly_budget, cut_off_time } = body

  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ detail: 'Mess name is required' }, { status: 400 })
  }
  if (cut_off_time !== undefined && cut_off_time !== null && cut_off_time !== '' &&
      (typeof cut_off_time !== 'string' || !HHMM.test(cut_off_time))) {
    return NextResponse.json({ detail: 'Cut-off time must be HH:MM' }, { status: 400 })
  }
  const budget = estimated_monthly_budget === undefined || estimated_monthly_budget === null || estimated_monthly_budget === ''
    ? null
    : Number(estimated_monthly_budget)
  if (budget !== null && (isNaN(budget) || budget < 0)) {
    return NextResponse.json({ detail: 'Budget must be a positive number' }, { status: 400 })
  }

  try {
    // Generate a unique invite code (retry up to 5 times on collision)
    let inviteCode = generateInviteCode()
    for (let attempt = 0; attempt < 5; attempt++) {
      const existing = await prisma.mess.findFirst({ where: { inviteCode }, select: { id: true } })
      if (!existing) break
      inviteCode = generateInviteCode()
    }

    // Parse cut_off_time string ('21:00') into a Date for the TIME column
    const rawTime = (cut_off_time as string | undefined) || DEFAULT_CUTOFF_TIME
    const cutOffTimeDate = new Date(`1970-01-01T${rawTime}:00.000Z`)

    const mess = await prisma.$transaction(async (tx) => {
      const created = await tx.mess.create({
        data: {
          name: name.trim(),
          inviteCode,
          cutOffTime: cutOffTimeDate,
          estimatedMonthlyBudget: budget,
          isActive: true,
        },
        select: { id: true, name: true, inviteCode: true, cutOffTime: true },
      })

      await tx.messMembership.create({
        data: { memberId: payload.sub, messId: created.id, role: 'ADMIN', isActive: true },
      })

      await tx.mealConfig.createMany({
        data: DEFAULT_MEAL_CONFIGS.map((cfg) => ({
          messId: created.id,
          mealType: cfg.mealType,
          cutoffTime: new Date(`1970-01-01T${cfg.cutoffTime}:00.000Z`),
          enabled: true,
          maxCount: DEFAULT_MAX_MEAL_COUNT,
        })),
        skipDuplicates: true,
      })

      return created
    })

    await refreshMessSettings(mess.id)

    return NextResponse.json({
      id: mess.id,
      name: mess.name,
      invite_code: mess.inviteCode,
      cut_off_time: mess.cutOffTime.toISOString().slice(11, 16),
    })
  } catch (err) {
    console.error('[POST /api/mess]', err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
