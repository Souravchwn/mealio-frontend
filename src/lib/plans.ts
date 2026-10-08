/**
 * plans.ts — Subscription plans and their limits.
 *
 * Everyone is on FREE for now. The limits exist to stop abuse (spam messes,
 * runaway hosting cost) and give us the hooks for paid plans later: change a
 * mess's plan in the platform console and these limits follow.
 */

export type PlanKey = 'FREE' | 'PLUS' | 'PRO'

export interface PlanLimits {
  label: string
  /** Approved, active members per mess */
  maxMembers: number
  /** Messes one person may create (not counting deleted ones) */
  maxOwnedMesses: number
}

export const PLANS: Record<PlanKey, PlanLimits> = {
  FREE: { label: 'Free', maxMembers: 40, maxOwnedMesses: 2 },
  PLUS: { label: 'Plus', maxMembers: 80, maxOwnedMesses: 5 },
  PRO: { label: 'Pro', maxMembers: 250, maxOwnedMesses: 20 },
}

export const PLAN_KEYS = Object.keys(PLANS) as PlanKey[]

export function getPlan(key: string | null | undefined): PlanLimits {
  return PLANS[(key as PlanKey) ?? 'FREE'] ?? PLANS.FREE
}
