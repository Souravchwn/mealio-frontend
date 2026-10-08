/** GET /api/platform/me — the signed-in platform admin. */

import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAdmin } from '@/lib/platform-auth'

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAdmin(req)
  if (auth.error) return auth.error
  return NextResponse.json({ admin: auth.admin })
}
