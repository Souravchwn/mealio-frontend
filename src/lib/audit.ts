/**
 * Centralized audit log helpers.
 * Use `createAudit()` for standalone writes.
 * Use `createAuditTx()` inside a `prisma.$transaction` to keep atomicity.
 */

import { prisma } from './prisma'
import type { Prisma } from '@prisma/client'

export type AuditAction =
  | 'TOGGLE_MEAL'
  | 'ADMIN_MEAL_OVERRIDE'
  | 'ADMIN_EXPENSE_EDIT'
  | 'ADMIN_EXPENSE_DELETE'
  | 'ADMIN_MEMBER_UPDATE'
  | 'ADMIN_SETTINGS_UPDATE'
  | 'CLOSE_MONTH'

export interface AuditEntry {
  messId: string
  actorId: string
  action: AuditAction
  targetTable?: string
  targetId?: string
  oldValue?: object
  newValue?: object
}

export async function createAudit(entry: AuditEntry): Promise<void> {
  await prisma.auditLog.create({ data: entry })
}

/** Use this overload inside prisma.$transaction to keep update + audit atomic. */
export function createAuditTx(
  tx: Prisma.TransactionClient,
  entry: AuditEntry,
) {
  return tx.auditLog.create({ data: entry })
}
