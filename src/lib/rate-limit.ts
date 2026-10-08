/**
 * Rate limiting for API routes.
 *
 * Uses Upstash Redis (fixed window, shared across all serverless instances)
 * when configured, and falls back to a per-process sliding window otherwise.
 */

import { getRedis } from './redis'
import { LOGIN_MAX_ATTEMPTS, LOGIN_IP_MAX_FAILURES, LOGIN_WINDOW_MS } from './constants'

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

  /** Same answer as check(), but does not count a new hit. */
  peek(key: string): { allowed: boolean; retryAfterMs?: number } {
    const now = Date.now()
    const recent = (this.store.get(key)?.timestamps ?? []).filter((t) => t > now - this.windowMs)
    if (recent.length < this.maxRequests) return { allowed: true }
    return { allowed: false, retryAfterMs: Math.max(this.windowMs - (now - Math.min(...recent)), 0) }
  }

  record(key: string): void {
    const entry = this.store.get(key) ?? { timestamps: [] }
    entry.timestamps = entry.timestamps.filter((t) => t > Date.now() - this.windowMs)
    entry.timestamps.push(Date.now())
    this.store.set(key, entry)
  }

  clear(key: string): void {
    this.store.delete(key)
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

function memoryLimiter(name: string, maxRequests: number, windowMs: number): RateLimiter {
  let limiter = memoryLimiters.get(name)
  if (!limiter) {
    limiter = new RateLimiter(maxRequests, windowMs)
    memoryLimiters.set(name, limiter)
  }
  return limiter
}

/** Is `name:key` over its limit right now? Does not count anything. */
export async function peekRateLimit(
  name: string,
  key: string,
  maxRequests: number,
  windowMs: number,
): Promise<{ allowed: boolean; retryAfterMs?: number }> {
  const redis = getRedis()
  if (redis) {
    try {
      const count = Number((await redis.get(`mealio:ratelimit:${name}:${key}`)) ?? 0)
      if (count < maxRequests) return { allowed: true }
      const ttl = await redis.pttl(`mealio:ratelimit:${name}:${key}`)
      return { allowed: false, retryAfterMs: ttl > 0 ? ttl : windowMs }
    } catch (err) {
      console.error('[rate-limit] redis failed, using memory fallback', err)
    }
  }
  return memoryLimiter(name, maxRequests, windowMs).peek(key)
}

/** Count one hit against `name:key` without checking the limit. */
export async function recordRateLimit(name: string, key: string, maxRequests: number, windowMs: number): Promise<void> {
  const redis = getRedis()
  if (redis) {
    try {
      const redisKey = `mealio:ratelimit:${name}:${key}`
      const count = await redis.incr(redisKey)
      if (count === 1) await redis.pexpire(redisKey, windowMs)
      return
    } catch (err) {
      console.error('[rate-limit] redis failed, using memory fallback', err)
    }
  }
  memoryLimiter(name, maxRequests, windowMs).record(key)
}

export async function clearRateLimit(name: string, key: string, maxRequests: number, windowMs: number): Promise<void> {
  const redis = getRedis()
  if (redis) {
    try {
      await redis.del(`mealio:ratelimit:${name}:${key}`)
      return
    } catch (err) {
      console.error('[rate-limit] redis failed, using memory fallback', err)
    }
  }
  memoryLimiter(name, maxRequests, windowMs).clear(key)
}

/*
 * Login brute-force protection.
 * Only FAILED sign-ins count. Many housemates share one public IP (home Wi-Fi, mobile carrier),
 * so counting successful sign-ins would lock a whole mess out on a busy evening.
 *   per email: LOGIN_MAX_ATTEMPTS failures per window, cleared by a successful sign-in
 *   per IP:    LOGIN_IP_MAX_FAILURES failures per window (higher, because the IP is shared)
 */
export async function isLoginBlocked(ip: string, email: string) {
  const [byIp, byEmail] = await Promise.all([
    peekRateLimit('login-fail-ip', ip, LOGIN_IP_MAX_FAILURES, LOGIN_WINDOW_MS),
    peekRateLimit('login-fail-email', email.toLowerCase().trim(), LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS),
  ])
  if (!byIp.allowed) return byIp
  return byEmail
}

export async function recordLoginFailure(ip: string, email: string) {
  await Promise.all([
    recordRateLimit('login-fail-ip', ip, LOGIN_IP_MAX_FAILURES, LOGIN_WINDOW_MS),
    recordRateLimit('login-fail-email', email.toLowerCase().trim(), LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS),
  ])
}

export async function clearLoginFailures(email: string) {
  await clearRateLimit('login-fail-email', email.toLowerCase().trim(), LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS)
}
