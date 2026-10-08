/**
 * Create (or reset the password of) a platform admin for the /console.
 *
 *   npm run platform-admin -- --email you@example.com --name "Your Name"
 *
 * The password is asked for interactively (never pass it on the command line,
 * it would end up in your shell history). Reads DATABASE_URL from .env.local.
 */
import { createInterface } from 'node:readline'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'

function arg(name) {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : undefined
}

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    process.stdout.write(question)
    rl._writeToOutput = () => {} // hide typed characters
    rl.question('', (answer) => {
      rl.close()
      process.stdout.write('\n')
      resolve(answer)
    })
  })
}

const email = (arg('email') || '').trim().toLowerCase()
const name = (arg('name') || 'Platform Admin').trim()
if (!email || !email.includes('@')) {
  console.error('Usage: npm run platform-admin -- --email you@example.com --name "Your Name"')
  process.exit(1)
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set (expected in .env.local)')
  process.exit(1)
}

const password = process.env.PLATFORM_ADMIN_PASSWORD || (await askHidden('Password (min 12 characters): '))
if (password.length < 12) {
  console.error('Use at least 12 characters for a platform admin password.')
  process.exit(1)
}
if (!process.env.PLATFORM_ADMIN_PASSWORD) {
  const again = await askHidden('Repeat password: ')
  if (again !== password) {
    console.error('Passwords do not match.')
    process.exit(1)
  }
}

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL) })
const passwordHash = await bcrypt.hash(password, 12)
const admin = await prisma.platformAdmin.upsert({
  where: { email },
  create: { email, name, passwordHash },
  update: { name, passwordHash, isActive: true, passwordChangedAt: new Date() },
  select: { id: true, email: true },
})
await prisma.platformAuditLog.create({ data: { adminId: admin.id, action: 'ADMIN_CREATED_BY_SCRIPT', targetType: 'platform_admin', targetId: admin.id } })
await prisma.$disconnect()
console.log(`Platform admin ready: ${admin.email}. Sign in at /en/console/login`)
