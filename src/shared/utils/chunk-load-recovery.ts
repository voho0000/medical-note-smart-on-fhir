const CHUNK_RELOAD_ATTEMPTS_KEY = "mediprisma:chunk-reload-attempts"
const MAX_TRACKED_CHUNKS = 8

interface StorageLike {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

interface ChunkRecoveryEnvironment {
  storage: StorageLike
  reload: () => void
}

interface StoredChunkReloadAttempts {
  fingerprints: string[]
}

const CHUNK_ERROR_PATTERNS = [
  /ChunkLoadError/i,
  /Loading chunk [^ ]+ failed/i,
  /Failed to load chunk/i,
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /error loading dynamically imported module/i,
]

function errorNameAndMessage(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  return String(error ?? "")
}

function chunkFingerprint(error: unknown): string {
  const description = errorNameAndMessage(error)
  const chunkPath = description.match(/\/[^\s"'()]*_next\/static\/chunks\/[^\s"'()]+/i)?.[0]
  return (chunkPath?.replace(/[?#].*$/, "") ?? description).slice(0, 800)
}

function readFingerprints(storage: StorageLike): string[] {
  try {
    const raw = storage.getItem(CHUNK_RELOAD_ATTEMPTS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Partial<StoredChunkReloadAttempts>
    return Array.isArray(parsed.fingerprints)
      ? parsed.fingerprints.filter((value): value is string => typeof value === "string")
      : []
  } catch {
    return []
  }
}

export function isChunkLoadError(error: unknown): boolean {
  const description = errorNameAndMessage(error)
  return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(description))
}

/**
 * Reload once for each failed production chunk in the current browser tab.
 * The fingerprint remains in sessionStorage across the reload, so a repeated
 * failure renders the recovery UI instead of entering a reload loop.
 */
export function recoverFromChunkLoadError(
  error: unknown,
  environment?: ChunkRecoveryEnvironment,
): boolean {
  if (!isChunkLoadError(error)) return false

  const browserEnvironment = environment ?? (() => {
    if (typeof window === "undefined") return null
    try {
      return {
        storage: window.sessionStorage,
        reload: () => window.location.reload(),
      }
    } catch {
      return null
    }
  })()
  if (!browserEnvironment) return false

  const fingerprint = chunkFingerprint(error)
  const fingerprints = readFingerprints(browserEnvironment.storage)
  if (fingerprints.includes(fingerprint)) return false

  try {
    browserEnvironment.storage.setItem(
      CHUNK_RELOAD_ATTEMPTS_KEY,
      JSON.stringify({
        fingerprints: [...fingerprints, fingerprint].slice(-MAX_TRACKED_CHUNKS),
      } satisfies StoredChunkReloadAttempts),
    )
  } catch {
    // Without a durable guard, reloading could create an infinite loop.
    return false
  }

  browserEnvironment.reload()
  return true
}
