/**
 * meal-access.ts — Server-only. Who may change which meal log, and when.
 *
 * Rules (shared by meals/toggle, meals/guest and meals/today):
 *  - ADMIN / MANAGER may edit any member of their own mess, any non-frozen day.
 *  - Everyone else (MEMBER, GUEST) may edit only their own log, and only for
 *    today (before the cutoff) or a future day. Past days are read-only, so
 *    nobody can lower last week's meals to reduce their bill.
 */

import { prisma } from './prisma'
import type { TokenPayload } from './auth-utils'
import type { MessSettings } from './mess-settings'
import { todayIn } from './mess-settings'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
/** How far ahead a member may plan meals */
const MAX_DAYS_AHEAD = 60

export function isPrivileged(role: string): boolean {
  return role === 'ADMIN' || role === 'MANAGER'
}

/** True when the member belongs (and is active) in the given mess. One person, one mess. */
export async function isActiveMemberOfMess(memberId: string, messId: string): Promise<boolean> {
  const member = await prisma.member.findFirst({
    where: { id: memberId, messId, isActive: true, deletedAt: null },
    select: { id: true },
  })
  return !!member
}

export type AccessResult =
  | { ok: true; targetMemberId: string; date: string; isToday: boolean }
  | { ok: false; status: number; detail: string }

/**
 * Validate that `payload` may write the log of `requestedMemberId` on
 * `requestedDate` (defaults: self, today in the mess timezone).
 */
export async function checkMealWriteAccess(
  payload: TokenPayload,
  settings: MessSettings,
  requestedMemberId: unknown,
  requestedDate: unknown,
): Promise<AccessResult> {
  const targetMemberId =
    typeof requestedMemberId === 'string' && requestedMemberId ? requestedMemberId : payload.sub
  const today = todayIn(settings.timezone)
  const date = typeof requestedDate === 'string' && requestedDate ? requestedDate : today

  if (!DATE_RE.test(date) || isNaN(new Date(`${date}T00:00:00.000Z`).getTime())) {
    return { ok: false, status: 400, detail: 'Date must be YYYY-MM-DD' }
  }

  const privileged = isPrivileged(payload.role)

  if (targetMemberId !== payload.sub && !privileged) {
    return { ok: false, status: 403, detail: "You can only change your own meals" }
  }

  if (targetMemberId !== payload.sub && !(await isActiveMemberOfMess(targetMemberId, payload.messId))) {
    return { ok: false, status: 404, detail: 'Member not found in this mess' }
  }

  if (!privileged) {
    if (date < today) {
      return { ok: false, status: 403, detail: 'Past days cannot be changed. Ask your manager.' }
    }
    const maxAhead = new Date(`${today}T00:00:00.000Z`)
    maxAhead.setUTCDate(maxAhead.getUTCDate() + MAX_DAYS_AHEAD)
    if (new Date(`${date}T00:00:00.000Z`) > maxAhead) {
      return { ok: false, status: 400, detail: `You can plan meals up to ${MAX_DAYS_AHEAD} days ahead` }
    }
  }

  return { ok: true, targetMemberId, date, isToday: date === today }
}
