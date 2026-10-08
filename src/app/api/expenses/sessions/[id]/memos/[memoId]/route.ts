/**
 * GET /api/expenses/sessions/[id]/memos/[memoId]
 * The photo itself. Any member of the same mess may look, nobody else.
 * The browser fetches it with the Authorization header and shows it from a blob URL.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'

type Ctx = { params: Promise<{ id: string; memoId: string }> }

export async function GET(req: NextRequest, { params }: Ctx) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  const { id, memoId } = await params
  try {
    const memo = await prisma.bazaarMemo.findFirst({
      // The mess id comes from the token, never from the request
      where: { id: memoId, sessionId: id, messId: payload.messId },
      select: { data: true, mimeType: true },
    })
    if (!memo) return NextResponse.json({ detail: 'Photo not found' }, { status: 404 })
    return new NextResponse(new Uint8Array(memo.data), {
      headers: {
        'Content-Type': memo.mimeType,
        'Content-Disposition': 'inline',
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (err) {
    console.error('[GET /api/expenses/sessions/[id]/memos/[memoId]]', err)
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
