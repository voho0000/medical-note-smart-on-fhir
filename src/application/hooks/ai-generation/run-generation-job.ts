// Shared run body for one structured-AI generation slot: guard against
// double-starting the SAME slot (a different slot MAY run concurrently — each
// writes to its own slot), flip the running flag, run the producer, map an
// unparseable reply to the sentinel 'PARSE_FAILED', surface other failures via
// getUserErrorMessage, and persist a successful result to the encrypted
// session cache so a reload reuses it instead of re-billing.
import { getUserErrorMessage } from '@/src/core/errors'
import { saveEncryptedCache } from '@/src/infrastructure/cache/encrypted-session-cache'
import { isContextOverflowError } from '@/src/shared/utils/context-budget'
import type { AiResultStore } from './create-ai-result-store'

export async function runGenerationJob<T>(options: {
  store: AiResultStore<T>
  /** Slot key the result / loading / error land under. */
  key: string
  /** Encrypted-session-cache key — each feature keeps its historical format. */
  cacheKey: string
  /** Streams + parses one reply; null = parse failed (after any internal retry). */
  produce: () => Promise<T | null>
  /** A user cancellation invalidates the run without surfacing an error. */
  shouldCommit?: () => boolean
}): Promise<T | null> {
  const { store, key, cacheKey, produce, shouldCommit = () => true } = options
  // Never double-start the same slot's generation.
  if (store.getState().running[key]) return null
  const bundleRevision = store.getState().bundleRevision
  const isCurrentBundle = () => store.getState().bundleRevision === bundleRevision
  const {
    setRunning,
    setError,
    setIssue,
    setResult,
  } = store.getState()
  setRunning(key, true)
  setError(key, null)
  setIssue(key, null)
  try {
    const parsed = await produce()
    if (!isCurrentBundle() || !shouldCommit()) return null
    if (!parsed) {
      setError(key, 'PARSE_FAILED')
      return null
    }
    // Always commit to THIS run's own slot — even if the user has since
    // switched away, the result is stored and shows when they switch back.
    setResult(key, parsed)
    // Encryption is deliberately outside the visible running lifecycle. The
    // post-encryption guard keeps writes ordered without making the user wait:
    // a later metadata patch/new run replaces the object identity, and a
    // Bundle reset advances the revision, so this stale write becomes a no-op.
    void saveEncryptedCache(cacheKey, parsed, () => (
      isCurrentBundle() && shouldCommit() && store.getState().byKey[key] === parsed
    ))
    return parsed
  } catch (err) {
    if (isCurrentBundle() && shouldCommit()) {
      if (isContextOverflowError(err)) setIssue(key, err.issue)
      setError(key, getUserErrorMessage(err))
    }
    return null
  } finally {
    if (isCurrentBundle()) setRunning(key, false)
  }
}
