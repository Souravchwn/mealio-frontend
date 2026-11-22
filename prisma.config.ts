import path from 'node:path'
import { defineConfig } from 'prisma/config'

// prisma.config.ts — used by Prisma CLI (db pull, studio, migrate).
// Connection URL for the runtime client is configured in src/lib/prisma.ts.
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  datasource: {
    // A direct (unpooled) connection for CLI tools. DATABASE_URL_UNPOOLED is what the Neon
    // integration on Vercel sets; falls back to DATABASE_URL.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? '',
  },
})
