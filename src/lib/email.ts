/**
 * email.ts — Server-only, optional transactional email via Resend's HTTP API.
 *
 * Set RESEND_API_KEY and EMAIL_FROM (e.g. "Mealio <no-reply@yourdomain.com>")
 * to turn on email verification and self-service password reset. Without them
 * the app still works: password resets go through a code from the mess admin
 * or the platform team, and emails are simply not sent.
 */

export function isEmailEnabled(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM
}

export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '')
}

export async function sendEmail(to: string, subject: string, text: string, html?: string): Promise<boolean> {
  if (!isEmailEnabled()) {
    if (process.env.NODE_ENV !== 'production') {
      console.info(`[email] (not configured) would send to ${to}: ${subject}\n${text}`)
    }
    return false
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject, text, html: html ?? undefined }),
    })
    if (!res.ok) {
      console.error('[email] send failed', res.status, await res.text().catch(() => ''))
      return false
    }
    return true
  } catch (err) {
    console.error('[email] send failed', err)
    return false
  }
}

/** Minimal branded HTML wrapper with one button. */
export function emailHtml(heading: string, body: string, buttonLabel: string, url: string): string {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f5fb;font-family:Inter,Arial,sans-serif;color:#15112b">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:20px;padding:32px">
<div style="font-size:22px;font-weight:700;margin-bottom:8px">${esc(heading)}</div>
<p style="font-size:15px;line-height:1.6;color:#57536e">${esc(body)}</p>
<a href="${esc(url)}" style="display:inline-block;margin-top:16px;padding:14px 24px;border-radius:999px;background:#7c3aed;color:#fff;text-decoration:none;font-weight:700">${esc(buttonLabel)}</a>
<p style="font-size:12px;color:#85819c;margin-top:24px">If you did not ask for this, you can ignore this email.</p>
</div></body></html>`
}
