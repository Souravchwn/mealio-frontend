/**
 * site-url.ts — Server-only. The public address of the site, for every link we hand out
 * (invites, reset and verification emails, Telegram Mini App, webhook).
 *
 * Read at RUNTIME on purpose: Next.js freezes `process.env.NEXT_PUBLIC_*` into the build, so a value
 * added on Vercel after the last deploy would be missing. The bracket lookup below is not inlined.
 *
 * Order: APP_URL, NEXT_PUBLIC_APP_URL, then the domains Vercel provides on every deployment
 * (production domain, then this deployment's URL). localhost only during local development.
 */

const env = (key: string): string => (process.env[key] ?? '').trim()
const clean = (url: string) => url.replace(/\/+$/, '')

export function siteUrl(): string {
  const explicit = env('APP_URL') || env('NEXT_PUBLIC_APP_URL')
  if (explicit) return clean(explicit)
  // Set by Vercel on every deployment, without the scheme
  const production = env('VERCEL_PROJECT_PRODUCTION_URL')
  if (production && env('VERCEL_ENV') === 'production') return `https://${clean(production)}`
  const deployment = env('VERCEL_URL')
  if (deployment) return `https://${clean(deployment)}`
  if (process.env.NODE_ENV === 'production') {
    console.error('[site-url] No public address configured. Set APP_URL or NEXT_PUBLIC_APP_URL.')
  }
  return 'http://localhost:3000'
}

/** True when the address can be reached from the internet (https, not localhost). */
export function isPublicSiteUrl(url = siteUrl()): boolean {
  return /^https:\/\//.test(url) && !/localhost|127\.0\.0\.1/.test(url)
}
