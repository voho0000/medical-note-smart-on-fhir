/**
 * What a store test needs now that every answer is encrypted before it is
 * stored.
 *
 * Two things change. Decryption needs real WebCrypto, which jsdom does not
 * ship — the same swap the `bundle-crypto` suite makes. And every read is
 * asynchronous while every write finishes in the background, so an assertion
 * has to wait for something observable rather than for the next tick: real
 * AES-GCM does not resolve on the microtask queue.
 */
import { webcrypto } from 'crypto'
import { saveEncryptedCache } from '@/src/infrastructure/cache/encrypted-session-cache'

/** jsdom ships `getRandomValues` but not `crypto.subtle`. */
export function useRealWebCrypto(): void {
  const jsdomCrypto = globalThis.crypto
  beforeAll(() => {
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
  })
  afterAll(() => {
    Object.defineProperty(globalThis, 'crypto', { value: jsdomCrypto, configurable: true })
  })
}

/** Waits for a background encryption or decryption to land. */
export async function until(predicate: () => boolean, what: string): Promise<void> {
  for (let attempt = 0; attempt < 400; attempt++) {
    if (predicate()) return
    await new Promise((resolve) => { setTimeout(resolve, 5) })
  }
  throw new Error(`timed out waiting for ${what}`)
}

/** Waits until something has been written under `key`, and returns it. */
export async function storedCiphertext(key: string): Promise<string> {
  await until(() => localStorage.getItem(key) !== null, `${key} to be written`)
  return localStorage.getItem(key) ?? ''
}

/**
 * What is on disk is an AES-GCM envelope and nothing else: a version, a base64
 * IV, base64 ciphertext and a timestamp. Anything readable in there would be
 * the finding this whole change exists to close.
 */
export function expectSealedEnvelope(raw: string, plaintextFragments: readonly string[]): void {
  const stored = JSON.parse(raw) as Record<string, unknown>
  expect(stored.v).toBe(1)
  expect(typeof stored.iv).toBe('string')
  expect(typeof stored.data).toBe('string')
  expect(typeof stored.savedAt).toBe('number')
  expect(Object.keys(stored).sort()).toEqual(['data', 'iv', 'savedAt', 'v'])
  for (const fragment of plaintextFragments) {
    expect(raw).not.toContain(fragment)
  }
}

/**
 * Seals an arbitrary value under `key`, the way the stores do.
 *
 * For the cases a store cannot produce itself: a record written by a build that
 * published a value this one does not render, or a hand-edited store. The point
 * is that such a record still decrypts — it is the parsing below it, not the
 * envelope, that has to refuse it.
 */
export async function sealAnswers(key: string, value: unknown): Promise<void> {
  await saveEncryptedCache(key, value)
  await until(() => localStorage.getItem(key) !== null, `${key} to be sealed`)
}
