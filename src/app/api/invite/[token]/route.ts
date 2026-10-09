/**
 * /api/invite/[token] — public. A personal invite for a member who was added by name.
 *
 * GET  — who the invite is for and a preview of their own numbers this period
 *        (meals, paid, balance, meal rate). Nothing about anyone else.
 * POST { email, password, phone?, locale? } — take over that name: the member gets an
 *        email and password and is signed in. The invite is the admin's approval.
 *
 * The raw token is never stored (only its hash), works once and expires (INVITE_TTL_DAYS).
 */

import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { signToken, clientIp } from '@/lib/auth-utils'
import { checkRateLimit } from '@/lib/rate-limit'
import { findValidToken, sendVerificationEmail } from '@/lib/account-emails'
import { calculatePeriodSummary } from '@/lib/financial'
import { resolvePeriod } from '@/lib/period'
import { createAudit } from '@/lib/audit'
import { logSecurityEvent } from '@/lib/security-events'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const INVALID = { detail: 'This invite link has expired or was already used. Ask your mess admin for a new one.', code: 'INVITE_INVALID' }

type Ctx = { params: Promise<{ token: string }> }

/** The invited member, only while the invite is valid and they still have no account. */
async function findInvite(raw: string) {
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(raw)) return null
  const tok = await findValidToken(raw, 'INVITE')
  if (!tok) return null
  const member = await prisma.member.findFirst({
    where: {
      id: tok.memberId,
      passwordHash: null,
      isActive: true,
      deletedAt: null,
      mess: { isActive: true, deletedAt: null, suspendedAt: null },
    },
    select: { id: true, name: true, role: true, messId: true, mess: { select: { name: true } } },
  })
  if (!member || !member.messId) return null
  return { tok, member: { ...member, messId: member.messId } }
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const ip = clientIp(req)
  const rate = await checkRateLimit('invite-view', ip, 30, 10 * 60 * 1000)
  if (!rate.allowed) return NextResponse.json({ detail: 'Too many attempts. Try again later.' }, { status: 429 })

  const { token } = await ctx.params
  try {
    const invite = await findInvite(token)
    if (!invite) {
      await logSecurityEvent({ type: 'INVITE_LINK_INVALID', severity: 'WARN', ip })
      return NextResponse.json(INVALID, { status: 404 })
    }
    const { member } = invite
    const period = await resolvePeriod(member.messId, null)
    const summary = await calculatePeriodSummary(member.messId, period)
    const me = summary.forMember(member.id)
    return NextResponse.json({
      name: member.name,
      mess_name: member.mess?.name ?? '',
      period_start: period.startDate.toISOString().slice(0, 10),
      period_end: period.endDate.toISOString().slice(0, 10),
      meals: me.billableMeals,
      deposited: me.contributed,
      balance: me.balance,
      meal_rate: summary.mealRate,
    })
  } catch (err) {
    console.error('[GET /api/invite]', err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const ip = clientIp(req)
  const rate = await checkRateLimit('invite-claim', ip, 10, 60 * 60 * 1000)
  if (!rate.allowed) return NextResponse.json({ detail: 'Too many attempts. Try again later.' }, { status: 429 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ detail: 'Invalid request body' }, { status: 400 })
  }
  const { email, password, phone, locale } = body
  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    return NextResponse.json({ detail: 'Please enter a valid email address' }, { status: 400 })
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return NextResponse.json({ detail: 'Password must be at least 8 characters' }, { status: 400 })
  }
  const normEmail = email.toLowerCase().trim()
  const cleanPhone = typeof phone === 'string' && phone.trim() ? phone.trim().slice(0, 20) : null
  const lang = locale === 'bn' ? 'bn' : 'en'

  const { token } = await ctx.params
  try {
    const invite = await findInvite(token)
    if (!invite) {
      await logSecurityEvent({ type: 'INVITE_LINK_INVALID', severity: 'WARN', ip, email: normEmail })
      return NextResponse.json(INVALID, { status: 404 })
    }
    const { tok, member } = invite

    const taken = await prisma.member.findUnique({ where: { email: normEmail }, select: { id: true } })
    if (taken) {
      return NextResponse.json(
        { detail: 'This email already has a Mealio account. Use another email address.', code: 'EMAIL_TAKEN' },
        { status: 400 },
      )
    }
    const passwordHash = await bcrypt.hash(password, 10)

    // Only one claim can win: the member must still have no password at the moment of writing
    const claimed = await prisma.$transaction(async (tx) => {
      const res = await tx.member.updateMany({
        where: { id: member.id, passwordHash: null },
        data: { email: normEmail, passwordHash, ...(cleanPhone ? { phone: cleanPhone } : {}), joinStatus: 'APPROVED' },
      })
      if (res.count !== 1) return false
      await tx.authToken.updateMany({
        where: { memberId: member.id, purpose: 'INVITE', usedAt: null },
        data: { usedAt: new Date() },
      })
      return true
    })
    if (!claimed) return NextResponse.json(INVALID, { status: 404 })

    await createAudit({
      messId: member.messId,
      actorId: member.id,
      action: 'MEMBER_CLAIMED',
      targetTable: 'members',
      targetId: member.id,
      newValue: { name: member.name, via: 'invite', token: tok.id },
    })
    await logSecurityEvent({ type: 'MEMBER_CLAIMED', memberId: member.id, messId: member.messId, email: normEmail, ip, detail: { via: 'invite' } })
    void sendVerificationEmail(member.id, normEmail, member.name, lang)

    const session = await signToken({ sub: member.id, messId: member.messId, role: member.role })
    return NextResponse.json({
      access_token: session,
      refresh_token: session,
      user: { id: member.id, name: member.name, email: normEmail, role: member.role, mess_id: member.messId, mess_name: member.mess?.name ?? '' },
    })
  } catch (err) {
    console.error('[POST /api/invite]', err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
