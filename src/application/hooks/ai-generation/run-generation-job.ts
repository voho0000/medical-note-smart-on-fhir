// Shared run body for one structured-AI generation slot: guard against
// double-starting the SAME slot (a different slot MAY run concurrently — each
// writes to its own slot), flip the running flag, run the producer, map an
// unparseable reply to the sentinel 'PARSE_FAILED', surface other failures via
// getUserErrorMessage, and persist a successful result to the encrypted
// session cache so a reload reuses it instead of re-billing.
import { getUserErrorMessage } from '@/src/core/errors'
import { saveEncryptedCache } from '@/src/infrastructure/cache/encrypted-session-cache'
import type { AiResultStore } from './create-ai-result-store'

export async function runGenerationJob<T>(options: {
  store: AiResultStore<T>
  /** Slot key the result / loading / error land under. */
  key: string
  /** Encrypted-session-cache key — each feature keeps its historical format. */
  cacheKey: string
  /** Streams + parses one reply; null = parse failed (after any internal retry). */
  produce: () => Promise<T | null>
}): Promise<void> {
  const { store, key, cacheKey, produce } = options
  // Never double-start the same slot's generation.
  if (store.getState().running[key]) return
  const bundleRevision = store.getState().bundleRevision
  const isCurrentBundle = () => store.getState().bundleRevision === bundleRevision
  const { setRunning, setError, setResult } = store.getState()
  setRunning(key, true)
  setError(key, null)
  try {
    const parsed = await produce()
    if (!isCurrentBundle()) return
    if (!parsed) {
      setError(key, 'PARSE_FAILED')
      return
    }
    // Always commit to THIS run's own slot — even if the user has since
    // switched away, the result is stored and shows when they switch back.
    setResult(key, parsed)
    void saveEncryptedCache(cacheKey, parsed)
  } catch (err) {
    if (isCurrentBundle()) setError(key, getUserErrorMessage(err))
  } finally {
    if (isCurrentBundle()) setRunning(key, false)
  }
}
