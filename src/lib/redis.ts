/**
 * redis.ts — Server-only Upstash Redis client.
 *
 * Reads UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN. When they are not
 * set (local dev), `getRedis()` returns null and callers fall back to Postgres
 * or in-memory behaviour. Every helper here swallows Redis errors so a Redis
 * outage degrades to "slower", never to "broken".
 */

import { Redis } from '@upstash/redis'

let _redis: Redis | null | undefined
let _warned = false

export function getRedis(): Redis | null {
  if (_redis !== undefined) return _redis
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    if (!_warned && process.env.NODE_ENV === 'production') {
      console.warn('[redis] UPSTASH_REDIS_REST_URL/TOKEN not set, falling back to Postgres for settings')
      _warned = true
    }
    _redis = null
    return null
  }
  _redis = new Redis({ url, token })
  return _redis
}

export async function redisGet<T>(key: string): Promise<T | null> {
  const redis = getRedis()
  if (!redis) return null
  try {
    return await redis.get<T>(key)
  } catch (err) {
    console.error('[redis] get failed', key, err)
    return null
  }
}

export async function redisSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  try {
    await redis.set(key, value, { ex: ttlSeconds })
  } catch (err) {
    console.error('[redis] set failed', key, err)
  }
}

export async function redisDel(key: string): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  try {
    await redis.del(key)
  } catch (err) {
    console.error('[redis] del failed', key, err)
  }
}
