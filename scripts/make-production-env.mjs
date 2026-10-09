/**
 * Create .env.deploy.local from .env.production.example with fresh random secrets.
 *
 *   npm run env:production            create it (refuses to overwrite an existing file)
 *   npm run env:production -- --force  overwrite
 *
 * Fills JWT_SECRET, PLATFORM_JWT_SECRET and TELEGRAM_WEBHOOK_SECRET. Everything else comes from
 * your providers (database, Redis, Telegram token, email) and is left blank for you.
 * The file is git-ignored. Secrets are never printed.
 * It is NOT called .env.production.local on purpose: Next.js loads that name by itself during
 * `next build`, and its blank values would override your real local settings.
 */
import fs from 'node:fs'
import { randomBytes } from 'node:crypto'

const out = '.env.deploy.local'
if (fs.existsSync(out) && !process.argv.includes('--force')) {
  console.error(`${out} already exists. Use --force to replace it (this makes NEW secrets and signs everyone out).`)
  process.exit(1)
}

const hex = (bytes) => randomBytes(bytes).toString('hex')
const fill = { JWT_SECRET: hex(32), PLATFORM_JWT_SECRET: hex(32), TELEGRAM_WEBHOOK_SECRET: hex(24) }

let text = fs.readFileSync('.env.production.example', 'utf8')
for (const [key, value] of Object.entries(fill)) {
  text = text.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${value}`)
}
fs.writeFileSync(out, text)

const blank = text.split('\n').filter((l) => /^[A-Z_]+=\s*$/.test(l)).map((l) => l.replace('=', '').trim())
console.log(`Wrote ${out} with fresh JWT_SECRET, PLATFORM_JWT_SECRET and TELEGRAM_WEBHOOK_SECRET.`)
console.log(`Still for you to fill in: ${blank.join(', ')}`)
