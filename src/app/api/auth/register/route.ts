/**
 * POST /api/auth/register
 *
 * Two ways in:
 *   mode "create" → new account + new mess, the person becomes its ADMIN
 *   mode "join"   → new account in an existing mess (by invite code). If the mess
 *                   requires approval, the account waits as PENDING (no token).
 */

import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { signToken, clientIp } from '@/lib/auth-utils'
import { checkRateLimit } from '@/lib/rate-limit'
import { invalidateDailyLogsMarker } from '@/lib/daily-logs'
import { refreshMessSettings } from '@/lib/mess-settings'
import { createMessRecord } from '@/lib/mess-create'
import { getPlan } from '@/lib/plans'
import { logSecurityEvent } from '@/lib/security-events'
import { sendVerificationEmail } from '@/lib/account-emails'

const REGISTER_MAX_ATTEMPTS = 10
const REGISTER_WINDOW_MS = 60 * 60 * 1000
/** New messes per IP per day: stops scripted spam sign-ups */
const CREATE_MESS_PER_IP_PER_DAY = 3
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export async function POST(req: NextRequest) {
  const ip = clientIp(req)
  const rateCheck = await checkRateLimit('register-ip', ip, REGISTER_MAX_ATTEMPTS, REGISTER_WINDOW_MS)
  if (!rateCheck.allowed) {
    await logSecurityEvent({ type: 'RATE_LIMITED', severity: 'WARN', ip, detail: { route: 'register' } })
    const retryAfterSecs = Math.ceil((rateCheck.retryAfterMs ?? 0) / 1000)
    return NextResponse.json(
      { detail: `Too many attempts. Try again in ${retryAfterSecs}s.`, code: 'RATE_LIMITED' },
      { status: 429, headers: { 'Retry-After': String(retryAfterSecs) } },
    )
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ detail: 'Invalid request body' }, { status: 400 })
  }
  const { name, email, phone, password, mess_invite_code, mess_name, locale } = body
  const mode = body.mode === 'create' ? 'create' : 'join'

  if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) {
    return NextResponse.json({ detail: 'Please enter your name' }, { status: 400 })
  }
  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    return NextResponse.json({ detail: 'Please enter a valid email address' }, { status: 400 })
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return NextResponse.json({ detail: 'Password must be at least 8 characters' }, { status: 400 })
  }
  const normEmail = email.toLowerCase().trim()
  const cleanPhone = typeof phone === 'string' && phone.trim() ? phone.trim().slice(0, 20) : null
  const lang = locale === 'bn' ? 'bn' : 'en'

  try {
    const existing = await prisma.member.findUnique({ where: { email: normEmail }, select: { id: true } })
    if (existing) {
      return NextResponse.json(
        { detail: 'This email already has an account. Sign in, or reset your password if you forgot it.', code: 'EMAIL_TAKEN' },
        { status: 400 },
      )
    }
    const passwordHash = await bcrypt.hash(password, 10)

    // ── Start a new mess ─────────────────────────────────────────────────
    if (mode === 'create') {
      if (typeof mess_name !== 'string' || !mess_name.trim() || mess_name.trim().length > 80) {
        return NextResponse.json({ detail: 'Please give your mess a name' }, { status: 400 })
      }
      const perDay = await checkRateLimit('create-mess-ip', ip, CREATE_MESS_PER_IP_PER_DAY, 24 * 60 * 60 * 1000)
      if (!perDay.allowed) {
        await logSecurityEvent({ type: 'RATE_LIMITED', severity: 'WARN', ip, email: normEmail, detail: { route: 'register:create' } })
        return NextResponse.json({ detail: 'Too many new messes from this network today. Try again tomorrow.', code: 'RATE_LIMITED' }, { status: 429 })
      }

      const { member, mess } = await prisma.$transaction(async (tx) => {
        const mess = await createMessRecord(tx, { name: mess_name })
        const member = await tx.member.create({
          data: {
            messId: mess.id,
            name: name.trim(),
            email: normEmail,
            phone: cleanPhone,
            passwordHash,
            role: 'ADMIN',
            isActive: true,
            joinStatus: 'APPROVED',
          },
          select: { id: true, name: true, email: true, role: true, messId: true },
        })
        await tx.mess.update({ where: { id: mess.id }, data: { ownerId: member.id } })
        return { member, mess }
      })

      await refreshMessSettings(mess.id)
      await logSecurityEvent({ type: 'MESS_CREATED', ip, email: normEmail, memberId: member.id, messId: mess.id, detail: { name: mess.name } })
      void sendVerificationEmail(member.id, normEmail, member.name, lang)

      const token = await signToken({ sub: member.id, messId: mess.id, role: 'ADMIN' })
      return NextResponse.json({
        access_token: token,
        refresh_token: token,
        user: { id: member.id, name: member.name, email: member.email, role: member.role, mess_id: mess.id, mess_name: mess.name },
        invite_code: mess.inviteCode,
      })
    }

    // ── Join with an invite code ─────────────────────────────────────────
    if (typeof mess_invite_code !== 'string' || !mess_invite_code.trim()) {
      return NextResponse.json({ detail: 'Enter the invite code from your mess admin' }, { status: 400 })
    }
    const mess = await prisma.mess.findFirst({
      where: { inviteCode: mess_invite_code.toUpperCase().trim(), isActive: true, deletedAt: null, suspendedAt: null },
      select: { id: true, name: true, plan: true, requireJoinApproval: true },
    })
    if (!mess) {
      await logSecurityEvent({ type: 'INVITE_CODE_INVALID', severity: 'WARN', ip, email: normEmail })
      return NextResponse.json({ detail: 'That invite code does not work. Check it with your mess admin.', code: 'INVALID_CODE' }, { status: 400 })
    }

    const activeMembers = await prisma.member.count({ where: { messId: mess.id, isActive: true } })
    if (activeMembers >= getPlan(mess.plan).maxMembers) {
      return NextResponse.json({ detail: 'This mess is full. Ask the admin to make room.', code: 'MESS_FULL' }, { status: 400 })
    }

    const pending = mess.requireJoinApproval
    const member = await prisma.member.create({
      data: {
        messId: mess.id,
        name: name.trim(),
        email: normEmail,
        phone: cleanPhone,
        passwordHash,
        role: 'MEMBER',
        // A pending member is inactive, so nothing counts their meals until approval
        isActive: !pending,
        joinStatus: pending ? 'PENDING' : 'APPROVED',
      },
      select: { id: true, name: true, email: true, role: true, messId: true },
    })

    await logSecurityEvent({ type: pending ? 'JOIN_REQUESTED' : 'REGISTER', ip, email: normEmail, memberId: member.id, messId: mess.id })
    void sendVerificationEmail(member.id, normEmail, member.name, lang)

    if (pending) {
      return NextResponse.json({ pending: true, mess_name: mess.name })
    }

    await invalidateDailyLogsMarker(mess.id)
    const token = await signToken({ sub: member.id, messId: mess.id, role: member.role })
    return NextResponse.json({
      access_token: token,
      refresh_token: token,
      user: { id: member.id, name: member.name, email: member.email, role: member.role, mess_id: mess.id, mess_name: mess.name },
    })
  } catch (err) {
    console.error('[POST /api/auth/register]', err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
