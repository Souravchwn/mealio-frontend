/**
 * account-emails.ts — Server-only. Issues one-time tokens/codes for email
 * verification and password reset, and sends the emails when email is set up.
 */

import { prisma } from './prisma'
import { randomCode, randomToken, sha256 } from './tokens'
import { appUrl, emailHtml, isEmailEnabled, sendEmail } from './email'

const VERIFY_TTL_MS = 3 * 24 * 60 * 60 * 1000
const RESET_LINK_TTL_MS = 60 * 60 * 1000
export const RESET_CODE_TTL_MINUTES = 30
export const INVITE_TTL_DAYS = 14

type TokenPurpose = 'RESET' | 'VERIFY_EMAIL' | 'INVITE'

async function storeToken(memberId: string, purpose: TokenPurpose, raw: string, ttlMs: number, issuedBy: string) {
  // Only one live token per purpose per member
  await prisma.authToken.updateMany({
    where: { memberId, purpose, usedAt: null },
    data: { usedAt: new Date() },
  })
  await prisma.authToken.create({
    data: { memberId, purpose, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + ttlMs), issuedBy },
  })
}

/** Send the "confirm your email" link. No-op when email is not configured. */
export async function sendVerificationEmail(memberId: string, email: string, name: string, locale: 'en' | 'bn' = 'en'): Promise<void> {
  if (!isEmailEnabled()) return
  try {
    const raw = randomToken()
    await storeToken(memberId, 'VERIFY_EMAIL', raw, VERIFY_TTL_MS, 'SELF')
    const url = `${appUrl()}/${locale}/verify-email?token=${raw}`
    await sendEmail(
      email,
      'Confirm your email for Mealtill',
      `Hi ${name},\n\nWelcome to Mealtill. Confirm this is your email address so you can reset your password yourself if you ever forget it:\n${url}\n\nThe link works for 3 days.`,
      emailHtml(
        `Welcome, ${name}`,
        'Confirm this is your email address. Then you can reset your password yourself if you ever forget it.',
        'Confirm my email',
        url,
        { note: 'The link works for 3 days.' },
      ),
    )
  } catch (err) {
    console.error('[account-emails] verification failed', err)
  }
}

/**
 * Email a password reset: a one-time code (typed on the reset page with the email) and a link.
 * Both work for 1 hour; using either one cancels the other (see /api/auth/reset).
 * Returns false when email is not configured.
 */
export async function sendResetEmail(memberId: string, email: string, name: string, locale: 'en' | 'bn' = 'en'): Promise<boolean> {
  if (!isEmailEnabled()) return false
  const raw = randomToken()
  await storeToken(memberId, 'RESET', raw, RESET_LINK_TTL_MS, 'SELF')
  // The code is a second live RESET token next to the link, so it is created without cancelling the link
  const code = randomCode(8)
  await prisma.authToken.create({
    data: { memberId, purpose: 'RESET', tokenHash: sha256(code), expiresAt: new Date(Date.now() + RESET_LINK_TTL_MS), issuedBy: 'SELF' },
  })
  const url = `${appUrl()}/${locale}/reset-password?token=${raw}`
  const shown = `${code.slice(0, 4)}-${code.slice(4)}`
  return sendEmail(
    email,
    `${shown} is your Mealtill reset code`,
    `Hi ${name},\n\nYour code to reset your Mealtill password: ${shown}\n\nType it on the reset page with your email, or open this link:\n${url}\n\nThe code and the link work for 1 hour. If you did not ask for this, ignore this email; your password stays the same.`,
    emailHtml(
      'Reset your password',
      `Hi ${name}, here is your one-time code. Type it on the reset page together with your email, or tap the button.`,
      'Choose a new password',
      url,
      { code: shown, note: 'The code and the link work for 1 hour. If you did not ask for this, ignore this email; your password stays the same.' },
    ),
  )
}

/**
 * A short reset code a mess admin or the platform team can read out to a
 * locked-out member. Valid for 30 minutes, single use.
 */
export async function issueResetCode(memberId: string, issuedBy: string): Promise<{ code: string; expiresAt: Date }> {
  const code = randomCode(8)
  await storeToken(memberId, 'RESET', code, RESET_CODE_TTL_MINUTES * 60 * 1000, issuedBy)
  return { code, expiresAt: new Date(Date.now() + RESET_CODE_TTL_MINUTES * 60 * 1000) }
}

/** Find a valid, unused token by its raw value. Optionally require it to belong to a member. */
export async function findValidToken(raw: string, purpose: TokenPurpose, memberId?: string) {
  const row = await prisma.authToken.findUnique({
    where: { tokenHash: sha256(raw) },
    select: { id: true, memberId: true, purpose: true, expiresAt: true, usedAt: true },
  })
  if (!row || row.purpose !== purpose || row.usedAt || row.expiresAt < new Date()) return null
  if (memberId && row.memberId !== memberId) return null
  return row
}

/**
 * A personal invite for a name-only member: a link that lets them set their email and password
 * and take over their name. A new invite cancels the previous one. Valid for INVITE_TTL_DAYS days.
 */
export async function issueInvite(memberId: string, issuedBy: string, locale: 'en' | 'bn' = 'en'): Promise<{ url: string; expiresAt: Date }> {
  const raw = randomToken()
  const ttl = INVITE_TTL_DAYS * 24 * 60 * 60 * 1000
  await storeToken(memberId, 'INVITE', raw, ttl, issuedBy)
  return { url: `${appUrl()}/${locale}/invite/${raw}`, expiresAt: new Date(Date.now() + ttl) }
}

/** Email an invite link. Returns false when email is not configured. */
export async function sendInviteEmail(email: string, name: string, messName: string, url: string): Promise<boolean> {
  return sendEmail(
    email,
    `You are in ${messName} on Mealtill`,
    `Hi ${name},\n\n${messName} keeps its meals and money on Mealtill, and you are already on the list. Join to see your meals and balance, and set your own meal times:\n${url}\n\nThis personal link works once, for 14 days.`,
    emailHtml(
      `You are in ${messName}`,
      `Hi ${name}, ${messName} keeps its meals and money on Mealtill, and you are already on the list.\n\nJoin to see your meals and balance any time, turn meals on or off, and set your own meal times.`,
      'See my meals',
      url,
      { note: 'This personal link works once, for 14 days. Do not forward it: whoever opens it can join as you.' },
    ),
  )
}
