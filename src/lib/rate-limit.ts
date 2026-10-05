/**
 * Rate limiting for API routes.
 *
 * Uses Upstash Redis (fixed window, shared across all serverless instances)
 * when configured, and falls back to a per-process sliding window otherwise.
 */

import { getRedis } from './redis'
import { LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS } from './constants'

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

const memoryLimiters = new Map<string, RateLimiter>()

/**
 * Count one attempt for `name:key` and report whether it is allowed.
 * Example: checkRateLimit('login-ip', ip, 10, 15 * 60_000)
 */
export async function checkRateLimit(
  name: string,
  key: string,
  maxRequests: number,
  windowMs: number,
): Promise<{ allowed: boolean; retryAfterMs?: number }> {
  const redis = getRedis()
  if (redis) {
    const redisKey = `mealio:ratelimit:${name}:${key}`
    try {
      const count = await redis.incr(redisKey)
      if (count === 1) await redis.pexpire(redisKey, windowMs)
      if (count > maxRequests) {
        const ttl = await redis.pttl(redisKey)
        return { allowed: false, retryAfterMs: ttl > 0 ? ttl : windowMs }
      }
      return { allowed: true }
    } catch (err) {
      console.error('[rate-limit] redis failed, using memory fallback', err)
    }
  }

  let limiter = memoryLimiters.get(name)
  if (!limiter) {
    limiter = new RateLimiter(maxRequests, windowMs)
    memoryLimiters.set(name, limiter)
  }
  return limiter.check(key)
}

/** Login brute-force protection — checked per IP and per email. */
export async function checkLoginRateLimit(ip: string, email: string) {
  const [byIp, byEmail] = await Promise.all([
    checkRateLimit('login-ip', ip, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS),
    checkRateLimit('login-email', email.toLowerCase().trim(), LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS),
  ])
  if (!byIp.allowed) return byIp
  return byEmail
}
