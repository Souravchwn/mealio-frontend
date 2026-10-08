/**
 * security-events.ts — Server-only. Records security-relevant events for the
 * platform console (failed logins, sign-ups, rate limits, password resets…).
 * Never throws: monitoring must not break the request that triggered it.
 */

import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'

export type SecurityEventType =
  | 'LOGIN_OK'
  | 'LOGIN_FAILED'
  | 'LOGIN_BLOCKED'
  | 'REGISTER'
  | 'MESS_CREATED'
  | 'JOIN_REQUESTED'
  | 'JOIN_APPROVED'
  | 'JOIN_REJECTED'
  | 'INVITE_CODE_INVALID'
  | 'INVITE_CODE_ROTATED'
  | 'RATE_LIMITED'
  | 'PASSWORD_RESET_REQUESTED'
  | 'PASSWORD_RESET'
  | 'PASSWORD_RESET_FAILED'
  | 'PASSWORD_RESET_CODE_ISSUED'
  | 'EMAIL_VERIFIED'
  | 'ACCOUNT_DELETED'
  | 'MESS_DELETED'
  | 'PLATFORM_LOGIN_OK'
  | 'PLATFORM_LOGIN_FAILED'

export type Severity = 'INFO' | 'WARN' | 'HIGH'

export async function logSecurityEvent(event: {
  type: SecurityEventType
  severity?: Severity
  memberId?: string | null
  messId?: string | null
  email?: string | null
  ip?: string | null
  detail?: Prisma.InputJsonValue
}): Promise<void> {
  try {
    await prisma.securityEvent.create({
      data: {
        type: event.type,
        severity: event.severity ?? 'INFO',
        memberId: event.memberId ?? null,
        messId: event.messId ?? null,
        email: event.email ? event.email.toLowerCase().slice(0, 254) : null,
        ip: event.ip ?? null,
        detail: event.detail,
      },
    })
  } catch (err) {
    console.error('[security-events] failed to record', event.type, err)
  }
}
