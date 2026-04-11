import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Runs daily at midnight via Vercel cron
// Deactivates GUEST members whose guest_until date has passed
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = req.headers.get('Authorization')
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
    }
  }

  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  const expiredGuests = await prisma.member.findMany({
    where: {
      isGuest: true,
      isActive: true,
      guestUntil: { lt: today },
    },
    select: { id: true, name: true, messId: true, guestUntil: true },
  })

  if (expiredGuests.length === 0) {
    return NextResponse.json({ ok: true, deactivated: 0 })
  }

  const ids = expiredGuests.map((g) => g.id)
  await prisma.member.updateMany({ where: { id: { in: ids } }, data: { isActive: false } })

  await prisma.auditLog.createMany({
    data: expiredGuests.map((g) => ({
      messId: g.messId,
      actorId: null,
      action: 'AUTO_DEACTIVATE_GUEST',
      targetTable: 'members',
      targetId: g.id,
      newValue: { reason: `Guest period ended: ${g.guestUntil?.toISOString().slice(0, 10)}`, name: g.name },
    })),
  })

  return NextResponse.json({ ok: true, deactivated: expiredGuests.length })
}
