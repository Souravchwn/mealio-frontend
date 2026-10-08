import { NextResponse } from 'next/server'
import { isEmailEnabled } from '@/lib/email'

/** GET /api/auth/options: what the sign-in screens can offer. */
export async function GET() {
  return NextResponse.json({ email_enabled: isEmailEnabled() })
}
