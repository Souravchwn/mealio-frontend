/**
 * /api/support/tickets
 *   POST — open a ticket. Works signed in (name/email from the account) or
 *          signed out (locked-out users). Signed-out users get a private
 *          access key to follow the conversation.
 *   GET  — my tickets (signed in).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { clientIp } from '@/lib/auth-utils'
import { checkRateLimit } from '@/lib/rate-limit'
import { randomToken, sha256 } from '@/lib/tokens'
import { optionalMember, serializeTicket, TICKET_CATEGORIES, type TicketCategory } from '@/lib/support'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export async function POST(req: NextRequest) {
  const ip = clientIp(req)
  const member = await optionalMember(req)

  const rate = await checkRateLimit('support-create', member?.sub ?? ip, 5, 60 * 60 * 1000)
  if (!rate.allowed) {
    return NextResponse.json({ detail: 'You have opened several tickets recently. Please wait a little.', code: 'RATE_LIMITED' }, { status: 429 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ detail: 'Invalid request body' }, { status: 400 })
  }
  const subject = typeof body.subject === 'string' ? body.subject.trim() : ''
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  const category = TICKET_CATEGORIES.includes(body.category as TicketCategory) ? (body.category as TicketCategory) : 'OTHER'
  if (subject.length < 3 || subject.length > 140) {
    return NextResponse.json({ detail: 'Please write a short subject (3 to 140 characters).' }, { status: 400 })
  }
  if (message.length < 10 || message.length > 5000) {
    return NextResponse.json({ detail: 'Please describe the problem (at least 10 characters).' }, { status: 400 })
  }

  try {
    let name: string
    let email: string
    if (member) {
      const me = await prisma.member.findUnique({ where: { id: member.sub }, select: { name: true, email: true } })
      name = me?.name ?? 'Member'
      email = me?.email ?? ''
    } else {
      name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : ''
      email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
      if (!name) return NextResponse.json({ detail: 'Please enter your name.' }, { status: 400 })
      if (!EMAIL_RE.test(email)) return NextResponse.json({ detail: 'Please enter a valid email so we can reply.' }, { status: 400 })
    }

    const accessKey = member ? null : randomToken(24)
    const ticket = await prisma.supportTicket.create({
      data: {
        memberId: member?.sub ?? null,
        messId: member?.messId ?? null,
        name,
        email,
        category,
        subject,
        priority: category === 'ABUSE' ? 'HIGH' : 'NORMAL',
        accessKeyHash: accessKey ? sha256(accessKey) : null,
        messages: { create: { authorType: 'USER', authorId: member?.sub ?? null, authorName: name, body: message } },
      },
    })
    return NextResponse.json({ id: ticket.id, access_key: accessKey }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/support/tickets]', err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const member = await optionalMember(req)
  if (!member) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  try {
    const tickets = await prisma.supportTicket.findMany({
      where: { memberId: member.sub },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    })
    return NextResponse.json({ tickets: tickets.map((t) => serializeTicket(t)) })
  } catch (err) {
    console.error('[GET /api/support/tickets]', err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
