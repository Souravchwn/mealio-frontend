/**
 * InMemoryRateLimiter — sliding-window rate limiter per Telegram user.
 *
 * Limitation: state is per-process instance (acceptable for single-server /
 * single-region deploys). Swap the store for Redis if horizontal scaling
 * is needed without changing the interface.
 */

interface WindowEntry {
  timestamps: number[]
}

export interface RateLimitConfig {
  maxRequests: number
  windowMs: number
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequests: 5,
  windowMs: 10_000, // 10 seconds
}

export class InMemoryRateLimiter {
  private readonly store = new Map<string, WindowEntry>()
  private readonly config: RateLimitConfig

  constructor(config: RateLimitConfig = DEFAULT_CONFIG) {
    this.config = config
  }

  /**
   * Returns true if the request is allowed; false if rate-limited.
   * Automatically purges timestamps outside the window.
   */
  isAllowed(userId: number): boolean {
    const key = String(userId)
    const now = Date.now()
    const windowStart = now - this.config.windowMs

    const entry = this.store.get(key) ?? { timestamps: [] }
    // Evict expired timestamps
    entry.timestamps = entry.timestamps.filter((t) => t > windowStart)

    if (entry.timestamps.length >= this.config.maxRequests) {
      this.store.set(key, entry)
      return false
    }

    entry.timestamps.push(now)
    this.store.set(key, entry)
    return true
  }

  /** Seconds until the oldest request in the window expires. */
  retryAfterSeconds(userId: number): number {
    const key = String(userId)
    const entry = this.store.get(key)
    if (!entry || entry.timestamps.length === 0) return 0
    const oldest = Math.min(...entry.timestamps)
    const remaining = this.config.windowMs - (Date.now() - oldest)
    return Math.ceil(Math.max(remaining, 0) / 1000)
  }
}

let _limiter: InMemoryRateLimiter | null = null

export function getRateLimiter(): InMemoryRateLimiter {
  if (!_limiter) _limiter = new InMemoryRateLimiter()
  return _limiter
}
