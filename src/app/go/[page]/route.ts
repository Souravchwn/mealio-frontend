/**
 * GET /go/<page> — language-neutral links for the installed app (manifest start_url and
 * home-screen shortcuts). Sends the person to /<their locale>/<page>: the language they last
 * chose (next-intl's NEXT_LOCALE cookie), else their phone's language, else English.
 * Only known pages are accepted, so this can never be used as an open redirect.
 */

import { NextRequest, NextResponse } from 'next/server'

const PAGES = new Set(['overview', 'meals', 'expenses', 'headcount', 'my-summary', 'settings', 'setup'])
type Locale = 'en' | 'bn'

function pickLocale(req: NextRequest): Locale {
  const cookie = req.cookies.get('NEXT_LOCALE')?.value
  if (cookie === 'en' || cookie === 'bn') return cookie
  const accept = req.headers.get('accept-language')?.toLowerCase() ?? ''
  return accept.startsWith('bn') ? 'bn' : 'en'
}

export function GET(req: NextRequest, { params }: { params: Promise<{ page: string }> }) {
  return params.then(({ page }) => {
    const target = PAGES.has(page) ? page : 'overview'
    return NextResponse.redirect(new URL(`/${pickLocale(req)}/${target}`, req.url), 307)
  })
}
