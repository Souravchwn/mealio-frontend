import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

// Prevent multiple instances in Next.js hot-reload dev mode
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL environment variable is not set')
  const adapter = new PrismaPg({
    connectionString,
    // A free database can be asleep (Neon scales to zero); waking it takes a few seconds
    connectionTimeoutMillis: 15_000,
    // Never hang a request on a database that stopped answering: fail fast, the caller retries reads
    query_timeout: 10_000,
    // Serverless functions come and go: keep few connections and let idle ones close
    max: 5,
    idleTimeoutMillis: 20_000,
  })
  return new PrismaClient({ adapter })
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

/**
 * Run a READ once more after a short pause if the database did not answer (asleep, waking,
 * a dropped connection). Only for reads: a write must never be repeated blindly.
 */
export async function readWithRetry<T>(fn: () => Promise<T>, waitMs = 800): Promise<T> {
  try {
    return await fn()
  } catch {
    await new Promise((r) => setTimeout(r, waitMs))
    return fn()
  }
}
