/**
 * Move bazaar memo photos that are still stored inside Postgres to Vercel Blob.
 *
 *   npm run memos:to-blob             (dry run: only counts)
 *   npm run memos:to-blob -- --yes    (moves them)
 *
 * Needs DATABASE_URL and BLOB_READ_WRITE_TOKEN in .env.local. Safe to run again: it only
 * touches photos that are not in Blob yet, one at a time, and clears the bytes only after
 * the upload succeeded.
 */
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { put } from '@vercel/blob'
import { randomUUID } from 'node:crypto'

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error('BLOB_READ_WRITE_TOKEN is not set. Connect a Blob store in Vercel, Storage, and copy the token.')
  process.exit(1)
}

const apply = process.argv.includes('--yes')
const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL) })
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

const where = { blobUrl: null, NOT: { data: null } }
const total = await prisma.bazaarMemo.count({ where })
console.log(`${total} photo(s) still stored in the database.`)
if (!apply || total === 0) {
  if (total > 0) console.log('Run again with --yes to move them.')
  await prisma.$disconnect()
  process.exit(0)
}

let moved = 0
for (;;) {
  const batch = await prisma.bazaarMemo.findMany({
    where,
    select: { id: true, messId: true, sessionId: true, mimeType: true, data: true },
    take: 20,
  })
  if (batch.length === 0) break
  for (const m of batch) {
    const pathname = `memos/${m.messId}/${m.sessionId}/${randomUUID()}.${EXT[m.mimeType] ?? 'bin'}`
    const blob = await put(pathname, Buffer.from(m.data), {
      access: 'public',
      addRandomSuffix: true,
      contentType: m.mimeType,
      cacheControlMaxAge: 60 * 60 * 24 * 365,
    })
    await prisma.bazaarMemo.update({ where: { id: m.id }, data: { blobUrl: blob.url, data: null } })
    moved++
    process.stdout.write(`\rmoved ${moved}/${total}`)
  }
}
console.log(`\nDone. ${moved} photo(s) moved to Blob.`)
await prisma.$disconnect()
