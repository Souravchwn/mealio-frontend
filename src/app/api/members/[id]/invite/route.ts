/**
 * POST /api/members/[id]/invite { email?, locale? } (ADMIN)
 *
 * Personal invite for a member who was added by name and has not joined yet.
 * Returns a link the admin can share anywhere; also emails it when an email is given and
 * email is set up. Each new invite cancels the previous one, so it can be sent again any time.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken, clientIp } from '@/lib/auth-utils'
import { createAudit } from '@/lib/audit'
import { checkRateLimit } from '@/lib/rate-limit'
import { isEmailEnabled } from '@/lib/email'
import { issueInvite, sendInviteEmail } from '@/lib/account-emails'
import { logSecurityEvent } from '@/lib/security-events'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'ADMIN') return NextResponse.json({ detail: 'Admin access required' }, { status: 403 })

  const { id } = await params
  let body: { email?: unknown; locale?: unknown } = {}
  try {
    body = await req.json()
  } catch {
    /* empty body: link only */
  }
  const email = typeof body.email === 'string' && body.email.trim() ? body.email.trim().toLowerCase() : null
  if (email && !EMAIL_RE.test(email)) {
    return NextResponse.json({ detail: 'That email address does not look right.' }, { status: 400 })
  }
  const locale = body.locale === 'bn' ? 'bn' : 'en'

  const rate = await checkRateLimit('member-invite', payload.sub, 40, 60 * 60 * 1000)
  if (!rate.allowed) return NextResponse.json({ detail: 'Too many invites at once. Try again later.' }, { status: 429 })

  try {
    const member = await prisma.member.findFirst({
      where: { id, messId: payload.messId, deletedAt: null, isActive: true },
      select: { id: true, name: true, passwordHash: true, mess: { select: { name: true } } },
    })
    if (!member) return NextResponse.json({ detail: 'Member not found' }, { status: 404 })
    if (member.passwordHash) {
      return NextResponse.json({ detail: 'This member has already joined.', code: 'ALREADY_JOINED' }, { status: 400 })
    }

    const { url, expiresAt } = await issueInvite(member.id, `MESS_ADMIN:${payload.sub}`, locale)
    const emailed = email && isEmailEnabled() ? await sendInviteEmail(email, member.name, member.mess?.name ?? 'Your mess', url) : false

    await createAudit({
      messId: payload.messId,
      actorId: payload.sub,
      action: 'ADMIN_MEMBER_INVITE',
      targetTable: 'members',
      targetId: member.id,
      newValue: { name: member.name, emailed },
    })
    await logSecurityEvent({
      type: 'MEMBER_INVITED',
      memberId: member.id,
      messId: payload.messId,
      email,
      ip: clientIp(req),
      detail: { by: payload.sub, emailed },
    })

    return NextResponse.json({ url, expires_at: expiresAt.toISOString(), emailed, email_enabled: isEmailEnabled() })
  } catch (err) {
    console.error('[POST /api/members/%s/invite]', id, err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
