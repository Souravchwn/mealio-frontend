import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractToken } from '@/lib/auth-utils'
import { createAuditTx } from '@/lib/audit'

export async function GET(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  const mess = await prisma.mess.findUnique({
    where: { id: payload.messId },
    select: { name: true, cutOffTime: true, estimatedMonthlyBudget: true, monthStartDay: true },
  })

  if (!mess) return NextResponse.json({ detail: 'Mess not found' }, { status: 404 })

  return NextResponse.json({
    name: mess.name,
    cut_off_time: mess.cutOffTime.toISOString().slice(11, 16),
    estimated_monthly_budget: mess.estimatedMonthlyBudget ? Number(mess.estimatedMonthlyBudget) : null,
    month_start_day: mess.monthStartDay ?? 1,
  })
}

export async function PUT(req: NextRequest) {
  const token = extractToken(req)
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  if (payload.role !== 'ADMIN') {
    return NextResponse.json({ detail: 'Admin access required' }, { status: 403 })
  }

  const { name, cut_off_time, estimated_monthly_budget, month_start_day } = await req.json()
  const updateData: Record<string, unknown> = {}

  if (name !== undefined) {
    const trimmed = (name as string).trim()
    if (!trimmed) return NextResponse.json({ detail: 'Name cannot be empty' }, { status: 400 })
    updateData.name = trimmed
  }

  if (cut_off_time !== undefined) {
    const timeStr = cut_off_time as string
    if (!/^\d{2}:\d{2}$/.test(timeStr)) {
      return NextResponse.json({ detail: 'cut_off_time must be HH:MM' }, { status: 400 })
    }
    updateData.cutOffTime = new Date(`1970-01-01T${timeStr}:00.000Z`)
  }

  if (estimated_monthly_budget !== undefined) {
    updateData.estimatedMonthlyBudget = estimated_monthly_budget ?? null
  }

  if (month_start_day !== undefined) {
    const day = Number(month_start_day)
    if (isNaN(day) || day < 1 || day > 28 || !Number.isInteger(day)) {
      return NextResponse.json({ detail: 'month_start_day must be an integer between 1 and 28' }, { status: 400 })
    }
    updateData.monthStartDay = day
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ detail: 'No fields to update' }, { status: 400 })
  }

  const [mess] = await prisma.$transaction((tx) =>
    Promise.all([
      tx.mess.update({
        where: { id: payload.messId },
        data: updateData,
        select: { id: true, name: true, cutOffTime: true, estimatedMonthlyBudget: true, monthStartDay: true },
      }),
      createAuditTx(tx, {
        messId: payload.messId,
        actorId: payload.sub,
        action: 'ADMIN_SETTINGS_UPDATE',
        targetTable: 'messes',
        targetId: payload.messId,
        newValue: updateData as object,
      }),
    ]),
  )

  return NextResponse.json({
    ok: true,
    name: mess.name,
    cut_off_time: mess.cutOffTime.toISOString().slice(11, 16),
    estimated_monthly_budget: mess.estimatedMonthlyBudget ? Number(mess.estimatedMonthlyBudget) : null,
    month_start_day: mess.monthStartDay,
  })
}
