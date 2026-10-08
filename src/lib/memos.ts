/**
 * memos.ts — Server-only helpers for bazaar memo photos.
 *
 * The browser shrinks photos before sending (see MemoPicker), so a memo is
 * normally 150 to 500 KB. The server still checks everything itself: how many,
 * how big, and that the bytes really are an image (the declared type is not trusted).
 */

export const MAX_MEMOS_PER_SESSION = 3
export const MAX_MEMO_BYTES = 1_500_000
/** Largest money amount the database column can hold, with room to spare */
export const MAX_AMOUNT = 10_000_000

export interface MemoUpload {
  mimeType: string
  bytes: Uint8Array<ArrayBuffer>
}

/** What the API accepts: { mime_type, data } with data as plain base64 (no data: prefix). */
export function parseMemoUploads(raw: unknown): { memos: MemoUpload[] } | { error: string } {
  if (raw === undefined || raw === null) return { memos: [] }
  if (!Array.isArray(raw)) return { error: 'memos must be a list' }
  if (raw.length > MAX_MEMOS_PER_SESSION) {
    return { error: `You can attach up to ${MAX_MEMOS_PER_SESSION} photos per bazaar trip.` }
  }
  const memos: MemoUpload[] = []
  for (const entry of raw) {
    const data = (entry as { data?: unknown })?.data
    if (typeof data !== 'string' || data.length === 0) return { error: 'A memo photo is empty.' }
    // base64 is ~4/3 the size of the bytes, so reject oversized strings before decoding
    if (data.length > Math.ceil((MAX_MEMO_BYTES * 4) / 3) + 8) return { error: 'A memo photo is too large. Try a smaller photo.' }
    const decoded = Buffer.from(data, 'base64')
    if (decoded.length === 0 || decoded.length > MAX_MEMO_BYTES) return { error: 'A memo photo is too large. Try a smaller photo.' }
    const mimeType = sniffImageType(decoded)
    if (!mimeType) return { error: 'Memo photos must be JPEG, PNG or WebP images.' }
    memos.push({ mimeType, bytes: new Uint8Array(decoded) })
  }
  return { memos }
}

/** Identify the image by its first bytes. Returns null for anything else. */
export function sniffImageType(b: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (b.length > 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  return null
}

/** The small, data-free description of a memo that goes into session responses. */
export const MEMO_SELECT = { id: true, mimeType: true, sizeBytes: true, createdAt: true } as const

export function serializeMemo(m: { id: string; mimeType: string; sizeBytes: number; createdAt: Date }) {
  return { id: m.id, mime_type: m.mimeType, size_bytes: m.sizeBytes, created_at: m.createdAt.toISOString() }
}
