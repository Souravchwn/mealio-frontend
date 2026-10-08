/**
 * tokens.ts — Server-only helpers for one-time codes and secret tokens.
 * Only hashes are stored in the database; the raw value is shown or emailed once.
 */

import { createHash, randomBytes, randomInt } from 'crypto'

/** No 0/O/1/I so codes are easy to read out loud. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function randomCode(length = 8): string {
  let code = ''
  for (let i = 0; i < length; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  return code
}

/** URL-safe secret for email links. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/** Normalise a human-typed code: uppercase, strip spaces and dashes. */
export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}
