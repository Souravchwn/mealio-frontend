/**
 * General-purpose in-memory rate limiter for API routes.
 * Per-key sliding window. Keys are typically IP addresses.
 *
 * Note: state is per-process instance. For multi-region deploys, swap
 * the store for Upstash Redis without changing the interface.
 */

interface Window {
  timestamps: number[]
}

export class RateLimiter {
  private readonly store = new Map<string, Window>()

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
  ) {}

  /** Returns { allowed: true } or { allowed: false, retryAfterMs: number } */
  check(key: string): { allowed: boolean; retryAfterMs?: number } {
    const now = Date.now()
    const windowStart = now - this.windowMs
    const entry = this.store.get(key) ?? { timestamps: [] }

    entry.timestamps = entry.timestamps.filter((t) => t > windowStart)

    if (entry.timestamps.length >= this.maxRequests) {
      this.store.set(key, entry)
      const oldest = Math.min(...entry.timestamps)
      const retryAfterMs = this.windowMs - (now - oldest)
      return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 0) }
    }

    entry.timestamps.push(now)
    this.store.set(key, entry)
    return { allowed: true }
  }
}

import { LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS } from './constants'

let _loginLimiter: RateLimiter | null = null

export function getLoginRateLimiter(): RateLimiter {
  if (!_loginLimiter) _loginLimiter = new RateLimiter(LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS)
  return _loginLimiter
}
