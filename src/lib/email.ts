/**
 * email.ts — Server-only transactional email.
 *
 * Two ways to send, picked automatically:
 *   1. Resend (RESEND_API_KEY + EMAIL_FROM): the long-term choice, best delivery.
 *   2. SMTP (SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD), for example a Gmail account with an
 *      app password. Fine to start with, but mail from a personal Gmail often lands in spam, so the UI
 *      tells people to check their spam folder.
 * Without either, the app still works: resets use a code from the mess admin or the staff console,
 * and emails are simply not sent.
 */

import nodemailer, { type Transporter } from 'nodemailer'

type Provider = 'resend' | 'smtp' | null

function provider(): Provider {
  if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) return 'resend'
  if (process.env.SMTP_HOST && process.env.SMTP_USERNAME && process.env.SMTP_PASSWORD) return 'smtp'
  return null
}

export function isEmailEnabled(): boolean {
  return provider() !== null
}

export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '')
}

/** The sender. Gmail only sends as the signed-in account, so SMTP uses that address. */
function fromAddress(): string {
  if (provider() === 'smtp') return `Mealtill <${process.env.SMTP_USERNAME}>`
  return process.env.EMAIL_FROM ?? 'Mealtill <no-reply@localhost>'
}

let smtp: Transporter | null = null
function smtpTransport(): Transporter {
  if (!smtp) {
    const port = Number(process.env.SMTP_PORT || 587)
    smtp = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465, // 587 upgrades with STARTTLS
      requireTLS: port !== 465,
      auth: { user: process.env.SMTP_USERNAME, pass: process.env.SMTP_PASSWORD },
      // Plain messages only: never read files or URLs into an email
      disableFileAccess: true,
      disableUrlAccess: true,
    })
  }
  return smtp
}

/** Reserved domains (RFC 2606/6761) that can never receive mail: tests and deleted accounts use them */
const UNDELIVERABLE = /@([^@]+\.)?(invalid|test|example|localhost|example\.(com|org|net))$/i

export async function sendEmail(to: string, subject: string, text: string, html?: string): Promise<boolean> {
  // Never try: it would only bounce back to our sender account and hurt its reputation
  if (UNDELIVERABLE.test(to.trim())) return false
  const via = provider()
  if (!via) {
    if (process.env.NODE_ENV !== 'production') {
      console.info(`[email] (not configured) would send to ${to}: ${subject}\n${text}`)
    }
    return false
  }
  try {
    if (via === 'smtp') {
      await smtpTransport().sendMail({ from: fromAddress(), to, subject, text, html: html ?? undefined })
      return true
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: fromAddress(), to, subject, text, html: html ?? undefined }),
    })
    if (!res.ok) {
      console.error('[email] send failed', res.status, await res.text().catch(() => ''))
      return false
    }
    return true
  } catch (err) {
    // Never log the message body or credentials
    console.error('[email] send failed via %s:', via, err instanceof Error ? err.message : err)
    return false
  }
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/**
 * The Mealtill email: wordmark, a heading, short paragraphs, one button, the link written out
 * (for apps that hide buttons), an optional one-time code, and a calm footer.
 * Table layout and inline styles so it looks right in Gmail, Outlook and phone mail apps.
 */
export function emailHtml(
  heading: string,
  body: string,
  buttonLabel: string,
  url: string,
  opts: { code?: string; note?: string } = {},
): string {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:#3f3b56">${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('')
  const code = opts.code
    ? `<div style="margin:6px 0 22px;padding:16px;border-radius:14px;background:#f3f0ff;text-align:center;font-family:'SFMono-Regular',Consolas,monospace;font-size:28px;font-weight:700;letter-spacing:6px;color:#15112b">${esc(opts.code)}</div>`
    : ''
  const note = opts.note ? `<p style="margin:18px 0 0;font-size:13px;line-height:1.5;color:#7a7692">${esc(opts.note)}</p>` : ''
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(heading)}</title></head>
<body style="margin:0;padding:0;background:#f6f5fb;-webkit-text-size-adjust:100%">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(body.split('\n')[0].slice(0, 120))}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5fb;padding:32px 12px">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
    <tr><td style="padding:0 8px 18px;font-family:Georgia,'Times New Roman',serif;font-size:26px;font-style:italic;color:#15112b">
      <span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#7c3aed;margin-right:8px;vertical-align:middle"></span>mealtill
    </td></tr>
    <tr><td style="background:#ffffff;border:1px solid #e6e3f0;border-radius:20px;padding:32px 28px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
      <h1 style="margin:0 0 14px;font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:400;line-height:1.2;color:#15112b">${esc(heading)}</h1>
      ${paragraphs}
      ${code}
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 6px"><tr><td style="border-radius:999px;background:#7c3aed">
        <a href="${esc(url)}" style="display:inline-block;padding:14px 26px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px">${esc(buttonLabel)}</a>
      </td></tr></table>
      <p style="margin:18px 0 0;font-size:13px;line-height:1.5;color:#7a7692">If the button does not work, open this link:<br><a href="${esc(url)}" style="color:#7c3aed;word-break:break-all">${esc(url)}</a></p>
      ${note}
    </td></tr>
    <tr><td style="padding:18px 8px 0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#85819c">
      You got this email because of your account on Mealtill, the meal and money tracker for messes. If you did not expect it, you can ignore it; nothing changes.
    </td></tr>
  </table>
</td></tr></table>
</body></html>`
}
