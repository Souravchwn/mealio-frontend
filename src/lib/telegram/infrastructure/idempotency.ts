/**
 * IdempotencyGuard — prevents duplicate processing of Telegram updates.
 *
 * Telegram guarantees at-least-once delivery. We store processed update_ids
 * in the DB so retried webhooks are silently dropped. The table is append-only;
 * a background job (or Supabase pg_cron) can purge rows older than 30 days.
 */

import { prisma } from '@/lib/prisma'

export class IdempotencyGuard {
  /**
   * Attempt to mark updateId as processed.
   * Returns true  → first time seen, proceed with handling.
   * Returns false → duplicate, skip.
   */
  async markProcessed(updateId: number): Promise<boolean> {
    try {
      await prisma.processedUpdate.create({
        data: { updateId: BigInt(updateId) },
      })
      return true
    } catch {
      // Unique constraint violation = already processed
      return false
    }
  }
}

let _guard: IdempotencyGuard | null = null

export function getIdempotencyGuard(): IdempotencyGuard {
  if (!_guard) _guard = new IdempotencyGuard()
  return _guard
}
