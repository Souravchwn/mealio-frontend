/**
 * /api/support/tickets/[id]  (owner, or ?key= access key)
 *   GET  — the ticket and its conversation
 *   POST { body } — add a reply; reopens the ticket for the support team
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { clientIp } from '@/lib/auth-utils'
import { checkRateLimit } from '@/lib/rate-limit'
import { canAccessTicket, serializeTicket } from '@/lib/support'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const access = await canAccessTicket(req, id)
  if (!access.ok) return NextResponse.json({ detail: 'Ticket not found' }, { status: 404 })
  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  })
  if (!ticket) return NextResponse.json({ detail: 'Ticket not found' }, { status: 404 })
  return NextResponse.json(serializeTicket(ticket))
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const access = await canAccessTicket(req, id)
  if (!access.ok) return NextResponse.json({ detail: 'Ticket not found' }, { status: 404 })

  const rate = await checkRateLimit('support-reply', access.member?.sub ?? clientIp(req), 20, 60 * 60 * 1000)
  if (!rate.allowed) return NextResponse.json({ detail: 'Please slow down a little.', code: 'RATE_LIMITED' }, { status: 429 })

  let body: { body?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ detail: 'Invalid request body' }, { status: 400 })
  }
  const text = typeof body.body === 'string' ? body.body.trim() : ''
  if (text.length < 1 || text.length > 5000) {
    return NextResponse.json({ detail: 'Write a message first.' }, { status: 400 })
  }

  try {
    const ticket = await prisma.supportTicket.findUnique({ where: { id }, select: { name: true, status: true } })
    if (!ticket) return NextResponse.json({ detail: 'Ticket not found' }, { status: 404 })
    if (ticket.status === 'CLOSED') {
      return NextResponse.json({ detail: 'This ticket is closed. Please open a new one.' }, { status: 400 })
    }
    await prisma.$transaction([
      prisma.supportMessage.create({
        data: { ticketId: id, authorType: 'USER', authorId: access.member?.sub ?? null, authorName: ticket.name, body: text },
      }),
      prisma.supportTicket.update({ where: { id }, data: { status: 'OPEN' } }),
    ])
    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/support/tickets/%s]', id, err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
