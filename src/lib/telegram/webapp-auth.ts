/**
 * webapp-auth.ts — Server-only. Proves who opened the Telegram Mini App.
 *
 * Telegram hands the Mini App a signed `initData` string. The signature is an HMAC made with a key
 * derived from OUR bot token, so only Telegram can produce it. We check the signature and its age;
 * nothing in it is trusted otherwise. See core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

export interface WebAppUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  language_code?: string
}

/** initData older than this is refused (Telegram issues a fresh one every time the app opens). */
const MAX_AGE_SECONDS = 24 * 60 * 60

export function verifyInitData(raw: string | null | undefined, botToken = process.env.TELEGRAM_BOT_TOKEN): { user: WebAppUser; authDate: number } | null {
  if (!raw || !botToken || raw.length > 4096) return null

  const params = new URLSearchParams(raw)
  const hash = params.get('hash')
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return null
  params.delete('hash')

  // data-check-string: every other field as key=value, sorted by key, joined with newlines
  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n')

  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest()
  const expected = createHmac('sha256', secret).update(dataCheckString).digest()
  const given = Buffer.from(hash, 'hex')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null

  const authDate = Number(params.get('auth_date'))
  const now = Math.floor(Date.now() / 1000)
  if (!Number.isFinite(authDate) || authDate > now + 60 || now - authDate > MAX_AGE_SECONDS) return null

  try {
    const user = JSON.parse(params.get('user') ?? 'null') as WebAppUser | null
    if (!user || typeof user.id !== 'number') return null
    return { user, authDate }
  } catch {
    return null
  }
}
