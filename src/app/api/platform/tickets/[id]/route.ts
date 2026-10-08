/**
 * /api/platform/tickets/[id]
 *   GET   — ticket + conversation + the person's mess
 *   POST { body, status? } — staff reply (emails the user when email is set up)
 *   PATCH { status?, priority? }
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePlatformAdmin, platformAudit } from '@/lib/platform-auth'
import { serializeTicket, TICKET_PRIORITIES, TICKET_STATUSES } from '@/lib/support'
import { appUrl, emailHtml, sendEmail } from '@/lib/email'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Ctx) {
  const auth = await requirePlatformAdmin(req)
  if (auth.error) return auth.error
  const { id } = await params
  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  })
  if (!ticket) return NextResponse.json({ detail: 'Ticket not found' }, { status: 404 })
  const mess = ticket.messId
    ? await prisma.mess.findUnique({ where: { id: ticket.messId }, select: { id: true, name: true } })
    : null
  return NextResponse.json({ ...serializeTicket(ticket), mess })
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = await requirePlatformAdmin(req)
  if (auth.error) return auth.error
  const { id } = await params

  let body: { body?: unknown; status?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ detail: 'Invalid request body' }, { status: 400 })
  }
  const text = typeof body.body === 'string' ? body.body.trim() : ''
  if (!text || text.length > 5000) return NextResponse.json({ detail: 'Write a reply first.' }, { status: 400 })
  const nextStatus = (TICKET_STATUSES as readonly string[]).includes(body.status as string)
    ? (body.status as string)
    : 'WAITING_ON_USER'

  try {
    const ticket = await prisma.supportTicket.findUnique({ where: { id }, select: { email: true, name: true, subject: true } })
    if (!ticket) return NextResponse.json({ detail: 'Ticket not found' }, { status: 404 })
    await prisma.$transaction([
      prisma.supportMessage.create({
        data: { ticketId: id, authorType: 'STAFF', authorId: auth.admin.id, authorName: 'Mealio Support', body: text },
      }),
      prisma.supportTicket.update({ where: { id }, data: { status: nextStatus } }),
    ])
    await platformAudit(auth.admin.id, 'TICKET_REPLY', 'support_ticket', id, { status: nextStatus })
    void sendEmail(
      ticket.email,
      `Re: ${ticket.subject}`,
      `Hi ${ticket.name},\n\n${text}\n\nMealio Support`,
      emailHtml(`Hi ${ticket.name}`, text, 'Open Mealio', `${appUrl()}/en/support`),
    )
    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/platform/tickets/%s]', id, err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requirePlatformAdmin(req)
  if (auth.error) return auth.error
  const { id } = await params

  let body: { status?: unknown; priority?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ detail: 'Invalid request body' }, { status: 400 })
  }
  const data: { status?: string; priority?: string } = {}
  if ((TICKET_STATUSES as readonly string[]).includes(body.status as string)) data.status = body.status as string
  if ((TICKET_PRIORITIES as readonly string[]).includes(body.priority as string)) data.priority = body.priority as string
  if (!data.status && !data.priority) return NextResponse.json({ detail: 'Nothing to change' }, { status: 400 })

  try {
    await prisma.supportTicket.update({ where: { id }, data })
    await platformAudit(auth.admin.id, 'TICKET_UPDATE', 'support_ticket', id, data)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[PATCH /api/platform/tickets/%s]', id, err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
