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
      'Confirm your email for Mealio',
      `Hi ${name}, confirm your email for Mealio: ${url}`,
      emailHtml(`Hi ${name}`, 'Tap the button to confirm this is your email address.', 'Confirm email', url),
    )
  } catch (err) {
    console.error('[account-emails] verification failed', err)
  }
}

/** Email a password reset link. Returns false when email is not configured. */
export async function sendResetEmail(memberId: string, email: string, name: string, locale: 'en' | 'bn' = 'en'): Promise<boolean> {
  if (!isEmailEnabled()) return false
  const raw = randomToken()
  await storeToken(memberId, 'RESET', raw, RESET_LINK_TTL_MS, 'SELF')
  const url = `${appUrl()}/${locale}/reset-password?token=${raw}`
  return sendEmail(
    email,
    'Reset your Mealio password',
    `Hi ${name}, reset your Mealio password here (valid for 1 hour): ${url}`,
    emailHtml(`Hi ${name}`, 'Tap the button to choose a new password. The link works for 1 hour.', 'Reset password', url),
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
    `You are in ${messName} on Mealio`,
    `Hi ${name}, ${messName} keeps its meals and money on Mealio. Join to see your meals and balance: ${url}`,
    emailHtml(
      `Hi ${name}`,
      `${messName} keeps its meals and money on Mealio. Tap the button to see your meals and balance, and set your own meal times.`,
      'See my meals',
      url,
    ),
  )
}
