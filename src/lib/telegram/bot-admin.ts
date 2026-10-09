/**
 * bot-admin.ts — Server-only. Connect or disconnect the Telegram bot from the staff console.
 * Replaces running setWebhook by hand. Nothing secret is ever returned to the browser.
 */

import { siteUrl } from '@/lib/site-url'

export const BOT_COMMANDS: Array<[string, string]> = [
  ['start', 'Welcome message and command list'],
  ['link', 'Link your Mealtill account: /link CODE from web Settings'],
  ['mealtill', '[Admin] Activate me in this group: just send /mealtill'],
  ['status', "Today's meal status"],
  ['meal', 'Toggle meals: /meal on|off|breakfast|lunch|dinner|guest N'],
  ['rate', 'Current meal rate for this period'],
  ['balance', 'Your balance for this period'],
  ['nomeal', '[Admin] Turn off all meals and notify everyone'],
  ['mealon', '[Admin] Restore meals to personal defaults and notify everyone'],
  ['announce', '[Admin] Send a message to all members'],
]

interface TgResponse<T = unknown> { ok: boolean; result?: T; description?: string }

async function tg<T = unknown>(method: string, body?: unknown): Promise<TgResponse<T>> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return { ok: false, description: 'TELEGRAM_BOT_TOKEN is not set' }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    })
    return (await res.json()) as TgResponse<T>
  } catch {
    return { ok: false, description: 'Could not reach Telegram' }
  }
}

/** The public address Telegram must call. Telegram only accepts public HTTPS. */
export function appBaseUrl(): string {
  return siteUrl()
}

export function isPublicHttps(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && !['localhost', '127.0.0.1', '::1'].includes(u.hostname) && !u.hostname.endsWith('.local')
  } catch {
    return false
  }
}

export const expectedWebhookUrl = () => `${appBaseUrl()}/api/telegram/webhook`
/** The Mini App page. Paste this into @BotFather: Bot Settings, Configure Mini App. */
export const expectedMiniAppUrl = () => `${appBaseUrl()}/en/tg`

/** Updates the bot needs: chat messages, and being added to or removed from groups (self-setup). */
const ALLOWED_UPDATES = ['message', 'my_chat_member']

export interface BotStatus {
  tokenSet: boolean
  secretSet: boolean
  botOk: boolean
  botError: string | null
  botUsername: string | null
  botNameFromEnv: string | null
  appUrl: string
  appUrlPublic: boolean
  expectedUrl: string
  webhookUrl: string | null
  connected: boolean
  pending: number
  lastError: string | null
  /** The webhook asks Telegram for my_chat_member, so the bot can set itself up when added to a group */
  hearsGroupAdds: boolean
  miniAppUrl: string
  /** @BotFather has a Main Mini App configured (needed for the group button) */
  hasMiniApp: boolean
  /** The private chat menu button opens the Mini App */
  menuButtonSet: boolean
}

export async function getBotStatus(): Promise<BotStatus> {
  const tokenSet = !!process.env.TELEGRAM_BOT_TOKEN
  const base: BotStatus = {
    tokenSet,
    secretSet: !!process.env.TELEGRAM_WEBHOOK_SECRET,
    botOk: false,
    botError: null,
    botUsername: null,
    botNameFromEnv: process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? null,
    appUrl: appBaseUrl(),
    appUrlPublic: isPublicHttps(appBaseUrl()),
    expectedUrl: expectedWebhookUrl(),
    webhookUrl: null,
    connected: false,
    pending: 0,
    lastError: null,
    hearsGroupAdds: false,
    miniAppUrl: expectedMiniAppUrl(),
    hasMiniApp: false,
    menuButtonSet: false,
  }
  if (!tokenSet) return base

  const me = await tg<{ username: string; has_main_web_app?: boolean }>('getMe')
  if (!me.ok) return { ...base, botError: me.description ?? 'Telegram rejected the bot token' }

  const [info, menu] = await Promise.all([
    tg<{ url: string; pending_update_count: number; last_error_message?: string; allowed_updates?: string[] }>('getWebhookInfo'),
    tg<{ type: string; web_app?: { url: string } }>('getChatMenuButton', {}),
  ])
  const url = info.result?.url || null
  return {
    ...base,
    botOk: true,
    botUsername: me.result?.username ?? null,
    webhookUrl: url,
    connected: !!url && url === base.expectedUrl,
    pending: info.result?.pending_update_count ?? 0,
    lastError: info.result?.last_error_message ?? null,
    hearsGroupAdds: !!info.result?.allowed_updates?.includes('my_chat_member'),
    hasMiniApp: !!me.result?.has_main_web_app,
    menuButtonSet: menu.result?.type === 'web_app' && menu.result.web_app?.url === base.miniAppUrl,
  }
}

export async function connectWebhook(): Promise<{ ok: true } | { ok: false; detail: string }> {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!process.env.TELEGRAM_BOT_TOKEN) return { ok: false, detail: 'Set TELEGRAM_BOT_TOKEN first.' }
  if (!secret) return { ok: false, detail: 'Set TELEGRAM_WEBHOOK_SECRET first. The webhook refuses every update without it.' }
  if (!isPublicHttps(appBaseUrl())) {
    return { ok: false, detail: 'The site needs its public https address (APP_URL or NEXT_PUBLIC_APP_URL). Telegram cannot call localhost.' }
  }
  const set = await tg('setWebhook', { url: expectedWebhookUrl(), secret_token: secret, allowed_updates: ALLOWED_UPDATES, drop_pending_updates: true })
  if (!set.ok) return { ok: false, detail: set.description ?? 'Telegram refused the webhook' }
  const cmds = await tg('setMyCommands', { commands: BOT_COMMANDS.map(([command, description]) => ({ command, description })) })
  if (!cmds.ok) return { ok: false, detail: cmds.description ?? 'Webhook set, but the command menu was refused' }
  // A "Mealtill" button next to the message box in every private chat with the bot
  const menu = await tg('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Mealtill', web_app: { url: expectedMiniAppUrl() } } })
  if (!menu.ok) return { ok: false, detail: menu.description ?? 'Webhook set, but the menu button was refused' }
  return { ok: true }
}

export async function disconnectWebhook(): Promise<{ ok: boolean; detail?: string }> {
  const r = await tg('deleteWebhook', { drop_pending_updates: false })
  return r.ok ? { ok: true } : { ok: false, detail: r.description }
}
