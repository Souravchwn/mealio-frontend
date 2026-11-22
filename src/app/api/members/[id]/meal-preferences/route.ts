/**
 * /api/members/[id]/meal-preferences — an admin or manager sets another member's default meals
 * (for example a member who never signs in and never eats breakfast).
 *
 * GET    — that member's 6 defaults (gaps follow the mess default)
 * PUT    — change one default; same body and rules as the member's own route
 * DELETE — back to the mess default
 * The member must belong to the caller's mess (mess id always from the token).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken, type TokenPayload } from '@/lib/auth-utils'
import { getMessSettings } from '@/lib/mess-settings'
import { isPrivileged } from '@/lib/meal-access'
import { readMemberPreferences, resetMemberPreferences, updateMemberPreference } from '@/lib/member-preferences'

type Ctx = { params: Promise<{ id: string }> }

async function authorize(req: NextRequest, ctx: Ctx): Promise<{ payload: TokenPayload; memberId: string } | NextResponse> {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  if (!isPrivileged(payload.role)) return NextResponse.json({ detail: 'Admin or Manager access required' }, { status: 403 })
  const { id } = await ctx.params
  const member = await prisma.member.findFirst({
    where: { id, messId: payload.messId, deletedAt: null, joinStatus: 'APPROVED' },
    select: { id: true },
  })
  if (!member) return NextResponse.json({ detail: 'Member not found' }, { status: 404 })
  return { payload, memberId: member.id }
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await authorize(req, ctx)
  if (auth instanceof NextResponse) return auth
  try {
    const settings = await getMessSettings(auth.payload.messId)
    if (!settings) return NextResponse.json({ detail: 'Mess not found' }, { status: 404 })
    return NextResponse.json({ preferences: await readMemberPreferences(auth.memberId, auth.payload.messId, settings) })
  } catch (err) {
    console.error('[GET /api/members/[id]/meal-preferences] member=%s', auth.memberId, err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const auth = await authorize(req, ctx)
  if (auth instanceof NextResponse) return auth
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ detail: 'Invalid request body' }, { status: 400 })
  }
  try {
    const settings = await getMessSettings(auth.payload.messId)
    if (!settings) return NextResponse.json({ detail: 'Mess not found' }, { status: 404 })
    const result = await updateMemberPreference({
      memberId: auth.memberId,
      messId: auth.payload.messId,
      actorId: auth.payload.sub,
      settings,
      body,
    })
    if (!result.ok) return NextResponse.json({ detail: result.detail }, { status: result.status })
    return NextResponse.json({ ok: true, applied_today: result.appliedToday })
  } catch (err) {
    console.error('[PUT /api/members/[id]/meal-preferences] member=%s', auth.memberId, err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = await authorize(req, ctx)
  if (auth instanceof NextResponse) return auth
  try {
    await resetMemberPreferences(auth.memberId, auth.payload.messId, auth.payload.sub)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[DELETE /api/members/[id]/meal-preferences] member=%s', auth.memberId, err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
