/**
 * support.ts — Server-only helpers shared by the user and platform support APIs.
 */

import type { NextRequest } from 'next/server'
import { prisma } from './prisma'
import { AuthUnavailableError, extractToken, verifyToken, type TokenPayload } from './auth-utils'
import { sha256 } from './tokens'

export const TICKET_CATEGORIES = ['ACCOUNT', 'BILLING', 'BUG', 'ABUSE', 'OTHER'] as const
export const TICKET_STATUSES = ['OPEN', 'WAITING_ON_USER', 'RESOLVED', 'CLOSED'] as const
export const TICKET_PRIORITIES = ['LOW', 'NORMAL', 'HIGH'] as const
export type TicketCategory = (typeof TICKET_CATEGORIES)[number]

/** Signed-in member, if the request carries a valid token. Never throws. */
export async function optionalMember(req: NextRequest): Promise<TokenPayload | null> {
  const token = extractToken(req)
  if (!token) return null
  try {
    return await verifyToken(token)
  } catch (err) {
    // Database briefly unavailable: treat as anonymous here, the session itself stays valid
    if (err instanceof AuthUnavailableError) return null
    throw err
  }
}

/**
 * Can this request read the ticket? Either the signed-in owner, or anyone
 * holding the private access key from the confirmation screen.
 */
export async function canAccessTicket(req: NextRequest, ticketId: string): Promise<{ ok: boolean; member: TokenPayload | null }> {
  const member = await optionalMember(req)
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    select: { memberId: true, accessKeyHash: true },
  })
  if (!ticket) return { ok: false, member }
  if (member && ticket.memberId === member.sub) return { ok: true, member }
  const key = new URL(req.url).searchParams.get('key')
  if (key && ticket.accessKeyHash && ticket.accessKeyHash === sha256(key)) return { ok: true, member }
  return { ok: false, member }
}

export function serializeTicket(t: {
  id: string
  name: string
  email: string
  category: string
  subject: string
  status: string
  priority: string
  messId: string | null
  memberId: string | null
  createdAt: Date
  updatedAt: Date
  messages?: { id: string; authorType: string; authorName: string; body: string; createdAt: Date }[]
}) {
  return {
    id: t.id,
    name: t.name,
    email: t.email,
    category: t.category,
    subject: t.subject,
    status: t.status,
    priority: t.priority,
    mess_id: t.messId,
    member_id: t.memberId,
    created_at: t.createdAt.toISOString(),
    updated_at: t.updatedAt.toISOString(),
    messages: t.messages?.map((m) => ({
      id: m.id,
      author_type: m.authorType,
      author_name: m.authorName,
      body: m.body,
      created_at: m.createdAt.toISOString(),
    })),
  }
}
