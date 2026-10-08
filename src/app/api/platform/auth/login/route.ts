/** POST /api/platform/auth/login { email, password } — platform console sign-in. */

import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { clientIp } from '@/lib/auth-utils'
import { checkRateLimit } from '@/lib/rate-limit'
import { signPlatformToken, platformAudit } from '@/lib/platform-auth'
import { logSecurityEvent } from '@/lib/security-events'

const DUMMY_HASH = bcrypt.hashSync('mealio-platform-timing-guard', 10)

export async function POST(req: NextRequest) {
  const ip = clientIp(req)
  let body: { email?: unknown; password?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ detail: 'Invalid request body' }, { status: 400 })
  }
  if (typeof body.email !== 'string' || typeof body.password !== 'string') {
    return NextResponse.json({ detail: 'Email and password are required' }, { status: 400 })
  }
  const email = body.email.toLowerCase().trim()

  // Stricter than member login: 5 tries per 15 minutes per IP and per email
  const [byIp, byEmail] = await Promise.all([
    checkRateLimit('platform-login-ip', ip, 5, 15 * 60 * 1000),
    checkRateLimit('platform-login-email', email, 5, 15 * 60 * 1000),
  ])
  if (!byIp.allowed || !byEmail.allowed) {
    await logSecurityEvent({ type: 'RATE_LIMITED', severity: 'HIGH', ip, email, detail: { route: 'platform-login' } })
    return NextResponse.json({ detail: 'Too many attempts. Try again later.', code: 'RATE_LIMITED' }, { status: 429 })
  }

  try {
    const admin = await prisma.platformAdmin.findUnique({ where: { email } })
    const valid = await bcrypt.compare(body.password, admin?.passwordHash ?? DUMMY_HASH)
    if (!admin || !valid || !admin.isActive) {
      await logSecurityEvent({ type: 'PLATFORM_LOGIN_FAILED', severity: 'HIGH', ip, email })
      return NextResponse.json({ detail: 'Invalid email or password' }, { status: 401 })
    }
    await prisma.platformAdmin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } })
    await logSecurityEvent({ type: 'PLATFORM_LOGIN_OK', severity: 'WARN', ip, email })
    await platformAudit(admin.id, 'LOGIN', null, null, { ip })
    const token = await signPlatformToken(admin.id)
    return NextResponse.json({ access_token: token, admin: { id: admin.id, name: admin.name, email: admin.email } })
  } catch (err) {
    console.error('[POST /api/platform/auth/login]', err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
