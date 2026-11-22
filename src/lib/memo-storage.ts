/**
 * memo-storage.ts — Server-only: where the bytes of a bazaar memo photo live.
 *
 * With BLOB_READ_WRITE_TOKEN set (Vercel, Storage, Blob), photos go to Vercel Blob and the
 * database keeps only the blob URL. Without it they stay in Postgres (bazaar_memos.data),
 * which is fine for local development but fills a free database within months.
 *
 * Blob URLs are public but unguessable (random suffix). They are never sent to the browser:
 * every photo is still served through GET /api/expenses/sessions/[id]/memos/[memoId], which
 * checks the member's token and mess first.
 */

import { put } from '@vercel/blob'
import { randomUUID } from 'node:crypto'
import type { MemoUpload } from './memos'

export function blobStorageEnabled(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN
}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

/** Upload one photo to Blob and return its URL. */
export async function uploadMemoBlob(messId: string, sessionId: string, memo: MemoUpload): Promise<string> {
  const pathname = `memos/${messId}/${sessionId}/${randomUUID()}.${EXT[memo.mimeType] ?? 'bin'}`
  const blob = await put(pathname, Buffer.from(memo.bytes), {
    access: 'public',
    addRandomSuffix: true,
    contentType: memo.mimeType,
    cacheControlMaxAge: 60 * 60 * 24 * 365,
  })
  return blob.url
}

/**
 * The database columns for a list of new photos: the blob URL when Blob is set up,
 * otherwise the bytes themselves. Uploads happen BEFORE the database transaction, so a
 * failed upload never leaves a trip half saved.
 */
export async function prepareMemoRows(
  messId: string,
  sessionId: string,
  memos: MemoUpload[],
): Promise<Array<{ mimeType: string; sizeBytes: number; data: Uint8Array<ArrayBuffer> | null; blobUrl: string | null }>> {
  if (!blobStorageEnabled()) {
    return memos.map((m) => ({ mimeType: m.mimeType, sizeBytes: m.bytes.length, data: m.bytes, blobUrl: null }))
  }
  const urls = await Promise.all(memos.map((m) => uploadMemoBlob(messId, sessionId, m)))
  return memos.map((m, i) => ({ mimeType: m.mimeType, sizeBytes: m.bytes.length, data: null, blobUrl: urls[i] }))
}

/** The photo bytes, wherever they are stored. Null when they cannot be found. */
export async function readMemoBytes(memo: { data: Uint8Array | null; blobUrl: string | null }): Promise<Uint8Array | null> {
  if (memo.data && memo.data.length > 0) return new Uint8Array(memo.data)
  if (!memo.blobUrl) return null
  const res = await fetch(memo.blobUrl, { cache: 'no-store' })
  if (!res.ok) {
    console.error('[memo-storage] blob fetch failed', res.status)
    return null
  }
  return new Uint8Array(await res.arrayBuffer())
}
