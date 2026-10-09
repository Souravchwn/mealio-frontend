/**
 * /api/platform/telegram  (staff only)
 *   GET            — is the bot configured, and is the webhook connected?
 *   POST { action: 'connect' | 'disconnect' } — set or remove the webhook in one click
 */

import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAdmin, platformAudit } from '@/lib/platform-auth'
import { connectWebhook, disconnectWebhook, getBotStatus } from '@/lib/telegram/bot-admin'

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAdmin(req)
  if (auth.error) return auth.error
  try {
    return NextResponse.json(await getBotStatus())
  } catch (err) {
    console.error('[GET /api/platform/telegram]', err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requirePlatformAdmin(req)
  if (auth.error) return auth.error

  let body: { action?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ detail: 'Invalid request body' }, { status: 400 })
  }
  try {
    if (body.action === 'connect') {
      const r = await connectWebhook()
      if (!r.ok) return NextResponse.json({ detail: r.detail }, { status: 400 })
      await platformAudit(auth.admin.id, 'TELEGRAM_CONNECT', 'telegram', null)
    } else if (body.action === 'disconnect') {
      const r = await disconnectWebhook()
      if (!r.ok) return NextResponse.json({ detail: r.detail ?? 'Telegram refused' }, { status: 400 })
      await platformAudit(auth.admin.id, 'TELEGRAM_DISCONNECT', 'telegram', null)
    } else {
      return NextResponse.json({ detail: 'Unknown action' }, { status: 400 })
    }
    return NextResponse.json(await getBotStatus())
  } catch (err) {
    console.error('[POST /api/platform/telegram]', err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
