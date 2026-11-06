/**
 * Broadcasts from admins and managers: stored in the
 * database, shown to every member on the Overview page, and served by GET /api/announcements
 * so a mobile app or widget can show them too. Nothing is pushed to phones.
 */

import { prisma } from './prisma'
import { ANNOUNCEMENT_VISIBLE_DAYS } from './constants'

/** Newest broadcasts returned at once */
export const ANNOUNCEMENT_LIST_LIMIT = 20

const DAY_MS = 24 * 60 * 60 * 1000

export function announcementToResponse(a: { id: string; message: string; authorName: string; createdAt: Date }) {
  return {
    id: a.id,
    message: a.message,
    author_name: a.authorName,
    created_at: a.createdAt.toISOString(),
    expires_at: new Date(a.createdAt.getTime() + ANNOUNCEMENT_VISIBLE_DAYS * DAY_MS).toISOString(),
  }
}

/** Broadcasts still within their visible window, newest first. */
export function listActiveAnnouncements(messId: string) {
  return prisma.announcement.findMany({
    where: { messId, createdAt: { gte: new Date(Date.now() - ANNOUNCEMENT_VISIBLE_DAYS * DAY_MS) } },
    orderBy: { createdAt: 'desc' },
    take: ANNOUNCEMENT_LIST_LIMIT,
    select: { id: true, message: true, authorName: true, createdAt: true },
  })
}
