/**
 * 最近使用 (FR-10): the prompts this account previewed or brought into the
 * workspace recently. Stores only prompt ids and timestamps, per account, in
 * this browser; never patient data or filled-in template values.
 */

export interface RecentPromptEntry {
  id: string
  /** Set for department templates so the entry can be resolved from the right list. */
  tenantId?: string
  at: number
}

const MAX_ENTRIES = 10
const storageKey = (accountId: string) => `mediprisma.promptGallery.recent.${accountId}`

const safeStorage = (): Storage | null => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

export function readRecentPrompts(accountId: string): RecentPromptEntry[] {
  const storage = safeStorage()
  if (!storage) return []
  try {
    const parsed: unknown = JSON.parse(storage.getItem(storageKey(accountId)) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((entry): entry is RecentPromptEntry => !!entry && typeof entry === 'object'
        && typeof (entry as RecentPromptEntry).id === 'string' && Number.isFinite((entry as RecentPromptEntry).at))
      .sort((a, b) => b.at - a.at)
      .slice(0, MAX_ENTRIES)
  } catch {
    return []
  }
}

/** Move (or add) a prompt to the front; one entry per prompt. */
export function recordRecentPrompt(accountId: string, prompt: { id: string; tenantId?: string }, now = Date.now()): RecentPromptEntry[] {
  const next = [{ id: prompt.id, ...(prompt.tenantId ? { tenantId: prompt.tenantId } : {}), at: now },
    ...readRecentPrompts(accountId).filter((entry) => entry.id !== prompt.id)].slice(0, MAX_ENTRIES)
  const storage = safeStorage()
  try {
    storage?.setItem(storageKey(accountId), JSON.stringify(next))
  } catch {
    // Quota or private mode: the in-memory result is still returned for this session.
  }
  return next
}

export function clearRecentPrompts(accountId: string): void {
  try {
    safeStorage()?.removeItem(storageKey(accountId))
  } catch {
    // ignore
  }
}
