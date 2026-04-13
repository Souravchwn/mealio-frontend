/**
 * POST /api/telegram/webhook
 *
 * Controller layer — validates the Telegram secret header and delegates
 * all processing to the Telegram module. This file contains zero business logic.
 */

import { NextRequest, NextResponse } from 'next/server'
import { handleWebhookUpdate } from '@/lib/telegram'
import type { TelegramUpdate } from '@/lib/telegram/dto'

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Always return 200 to prevent Telegram from retrying indefinitely
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (webhookSecret) {
    const incoming = req.headers.get('x-telegram-bot-api-secret-token')
    if (incoming !== webhookSecret) {
      console.warn('[Webhook] Invalid secret token — rejected')
      return NextResponse.json({ ok: true })
    }
  }

  let update: TelegramUpdate
  try {
    update = (await req.json()) as TelegramUpdate
  } catch {
    return NextResponse.json({ ok: true })
  }

  // Fire-and-forget: respond immediately, process in the background.
  // Vercel serverless functions wait for the event loop to drain before
  // returning, so await is fine here — but the 200 is sent synchronously.
  await handleWebhookUpdate(update)

  return NextResponse.json({ ok: true })
}
