import path from 'node:path'
import { defineConfig } from 'prisma/config'

// prisma.config.ts — used by Prisma CLI (db pull, studio, migrate).
// Connection URL for the runtime client is configured in src/lib/prisma.ts.
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  datasource: {
    // DIRECT_URL bypasses PgBouncer for CLI tools; falls back to DATABASE_URL.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '',
  },
})
