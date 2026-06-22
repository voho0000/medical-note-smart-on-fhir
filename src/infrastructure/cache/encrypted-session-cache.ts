// Small encrypted, session-scoped cache for AI-derived results (safety scans,
// insights, …) so they survive a page reload without re-billing the model.
//
// Privacy: these payloads are derived from patient data, so they get the SAME
// envelope as the imported bundle — encrypted with the tab-session key
// (bundle-crypto) and bounded to MAX_AGE_MS. A new tab/session can't decrypt
// (key is gone) → the stale blob is purged on read. The only difference from the
// bundle is the storage medium: localStorage (these payloads are small text),
// which can't hold the binary EncryptedRecord directly, so iv/data are base64'd.

import {
  getSessionBundleKey,
  encryptJson,
  decryptBytes,
  type EncryptedRecord,
} from '@/src/infrastructure/fhir/services/bundle-crypto'

/** localStorage-serialisable form of an EncryptedRecord (binary → base64). */
interface StoredRecord {
  v: 1
  iv: string
  data: string
  savedAt: number
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

/** Encrypt + persist a value under `key`. Best-effort: silently no-ops when the
 *  session key / storage is unavailable (caller keeps its in-memory copy). */
export async function saveEncryptedCache(key: string, value: unknown): Promise<void> {
  if (typeof window === 'undefined') return
  try {
    const cryptoKey = await getSessionBundleKey({ create: true })
    if (!cryptoKey) return
    const record = await encryptJson(cryptoKey, value)
    const stored: StoredRecord = {
      v: 1,
      iv: bytesToBase64(record.iv),
      data: bytesToBase64(new Uint8Array(record.data)),
      savedAt: record.savedAt,
    }
    window.localStorage.setItem(key, JSON.stringify(stored))
  } catch {
    // Best-effort cache — never throw into the caller.
  }
}

/** Load + decrypt a cached value, or null if missing / expired / undecryptable.
 *  Purges the entry in every not-usable case so it doesn't linger. */
export async function loadEncryptedCache<T>(key: string, maxAgeMs: number): Promise<T | null> {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const stored = JSON.parse(raw) as StoredRecord
    if (!stored || stored.v !== 1 || typeof stored.savedAt !== 'number' || Date.now() - stored.savedAt > maxAgeMs) {
      window.localStorage.removeItem(key)
      return null
    }
    // No `create`: a new session that can't decrypt should purge, not re-key.
    const cryptoKey = await getSessionBundleKey()
    if (!cryptoKey) {
      window.localStorage.removeItem(key)
      return null
    }
    const record: EncryptedRecord = {
      v: 1,
      iv: base64ToBytes(stored.iv),
      // Uint8Array.from() always allocates a plain ArrayBuffer (never shared).
      data: base64ToBytes(stored.data).buffer as ArrayBuffer,
      savedAt: stored.savedAt,
    }
    const plain = await decryptBytes(cryptoKey, record)
    return JSON.parse(new TextDecoder().decode(plain)) as T
  } catch {
    try { window.localStorage.removeItem(key) } catch { /* ignore */ }
    return null
  }
}

export function removeEncryptedCache(key: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

// Shared namespace for AI-derived result caches (safety scans, insights, …) so
// they can all be purged together when the user clears their data.
const AI_RESULT_PREFIX = 'mediprisma:ai-result:'

/** Cache key for an AI result, e.g. aiResultCacheKey('insights', patientId). */
export function aiResultCacheKey(scope: string, id: string): string {
  return `${AI_RESULT_PREFIX}${scope}:${id}`
}

/** Drop EVERY AI result cache — call when the user clears their bundle so a
 *  re-import of the same patient starts fresh instead of showing stale output. */
export function purgeAiResultCaches(): void {
  if (typeof window === 'undefined') return
  try {
    const keys: string[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (key && key.startsWith(AI_RESULT_PREFIX)) keys.push(key)
    }
    keys.forEach((key) => window.localStorage.removeItem(key))
  } catch {
    // ignore
  }
}

/** Stable short signature of a string — used to invalidate a cached result when
 *  the prompt/template that produced it changes (djb2, base36). */
export function contentSignature(input: string): string {
  let hash = 5381
  for (let i = 0; i < input.length; i++) hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0
  return (hash >>> 0).toString(36)
}
