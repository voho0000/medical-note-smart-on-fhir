// 門診偏好 ↔ the signed-in account. One subscription per signed-in session,
// owned by AuthProvider (the same shape as the Beta switch's sync).
//
// The account copy lives on the user document, users/{uid}.outpatientPrefs —
// settings only (analyte ids, template text, choices), never a patient value.
// This browser keeps its own copy per account, so the overview and the copy
// panel read locally and keep working offline; an edit is marked dirty until
// the account has it, and a dirty edit survives a reload.
//
// Conflicts: two devices can both change the settings before either sees the
// other. Neither side's work is dropped — formats are merged by id (the newer
// side's version of a format both touched wins), and the single choices
// (pinned list, filters, modes) take the newer side. A format deleted on one
// device while the other edited it comes back rather than being lost.

import { doc, onSnapshot, runTransaction, type DocumentData } from 'firebase/firestore'
import { db } from '@/src/shared/config/firebase.config'
import {
  sanitizeOutpatientPrefs,
  useOutpatientPrefsStore,
  type OutpatientPrefs,
} from '@/src/application/stores/outpatient-prefs.store'

export const OUTPATIENT_PREFS_FIELD = 'outpatientPrefs'
const WRITE_DELAY_MS = 600
/** Far under Firestore's 1 MiB document limit — the user document also
 *  carries the profile and the Beta switch. */
export const MAX_SYNCED_CHARS = 200_000

export interface RemoteOutpatientPrefs {
  prefs: OutpatientPrefs
  updatedAt: number
}

export function readRemoteOutpatientPrefs(data: DocumentData | undefined): RemoteOutpatientPrefs | null {
  const raw = data?.[OUTPATIENT_PREFS_FIELD]
  if (!raw || typeof raw !== 'object' || typeof raw.updatedAt !== 'number' || !Number.isFinite(raw.updatedAt)) return null
  return { prefs: sanitizeOutpatientPrefs(raw), updatedAt: raw.updatedAt }
}

/** The document field: the settings, their stamp, and nothing else. JSON
 *  round-trip drops any undefined, which Firestore refuses. */
export function toRemoteOutpatientPrefs(prefs: OutpatientPrefs, updatedAt: number): DocumentData {
  const { pinnedLabs, labMode, formats, activeFormatId, handoffMode } = sanitizeOutpatientPrefs(prefs)
  return JSON.parse(JSON.stringify({ pinnedLabs, labMode, formats, activeFormatId, handoffMode, updatedAt }))
}

/** Both sides changed: keep every format (the preferred side's version of a
 *  format both have), and each single choice from the preferred side unless
 *  it never set one. */
export function mergeOutpatientPrefs(
  preferred: OutpatientPrefs,
  other: OutpatientPrefs,
): OutpatientPrefs {
  const ids = new Set(preferred.formats.map((format) => format.id))
  return sanitizeOutpatientPrefs({
    pinnedLabs: preferred.pinnedLabs ?? other.pinnedLabs,
    labMode: preferred.labMode ?? other.labMode,
    formats: [...preferred.formats, ...other.formats.filter((format) => !ids.has(format.id))],
    activeFormatId: preferred.activeFormatId ?? other.activeFormatId,
    handoffMode: preferred.handoffMode ?? other.handoffMode,
  })
}

function samePrefs(a: OutpatientPrefs, b: OutpatientPrefs): boolean {
  return JSON.stringify(sanitizeOutpatientPrefs(a)) === JSON.stringify(sanitizeOutpatientPrefs(b))
}

export function syncOutpatientPrefsForAccount(userId: string): () => void {
  const database = db
  if (!database) return () => {}
  const store = useOutpatientPrefsStore
  const userRef = doc(database, 'users', userId)
  let active = true
  let inFlight = false
  let again = false
  let timer: ReturnType<typeof setTimeout> | null = null

  const schedule = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      void push()
    }, WRITE_DELAY_MS)
  }

  // Send this browser's copy. Read-then-write in one transaction, so a copy
  // another device saved since this one last synced is merged, not replaced.
  const push = async () => {
    if (!active) return
    if (inFlight) { again = true; return }
    const local = store.getState().byUser[userId]
    const meta = store.getState().syncMeta[userId]
    // Nothing new to send (a queued retry after the edit already went up).
    if (!local || (meta && !meta.dirty && meta.baseUpdatedAt !== null)) return
    inFlight = true
    try {
      const result = await runTransaction(database, async (transaction) => {
        const current = readRemoteOutpatientPrefs((await transaction.get(userRef)).data())
        const changedElsewhere = current !== null && current.updatedAt !== (meta?.baseUpdatedAt ?? null)
        const localIsNewer = !current || (meta?.updatedAt ?? 0) >= current.updatedAt
        const next = changedElsewhere
          ? localIsNewer ? mergeOutpatientPrefs(local, current.prefs) : mergeOutpatientPrefs(current.prefs, local)
          : local
        const stamp = Math.max(meta?.updatedAt ?? Date.now(), (current?.updatedAt ?? 0) + 1)
        const field = toRemoteOutpatientPrefs(next, stamp)
        if (JSON.stringify(field).length > MAX_SYNCED_CHARS) throw new Error('outpatient settings too large to sync')
        transaction.set(userRef, { [OUTPATIENT_PREFS_FIELD]: field }, { mergeFields: [OUTPATIENT_PREFS_FIELD] })
        return { next, stamp }
      })
      const state = store.getState()
      const now = state.byUser[userId]
      const nowMeta = state.syncMeta[userId]
      if (nowMeta?.updatedAt === meta?.updatedAt || !now) {
        state.replace(userId, result.next, { updatedAt: result.stamp, dirty: false, baseUpdatedAt: result.stamp })
      } else {
        // Edited again while this was on its way: keep the newer edit, fold
        // in whatever the merge brought from the account, and send again.
        state.replace(userId, mergeOutpatientPrefs(now, result.next), {
          updatedAt: Math.max(nowMeta?.updatedAt ?? 0, result.stamp + 1),
          dirty: true,
          baseUpdatedAt: result.stamp,
        })
        again = true
      }
      if (active) state.setSyncStatus(userId, 'synced')
    } catch (error) {
      // Offline, refused, or too large: the settings stay here, still dirty,
      // and go up with the next change or the next read of the account.
      console.warn('[Outpatient prefs sync] Could not save to the account:', error)
      if (active) store.getState().setSyncStatus(userId, 'error')
    } finally {
      inFlight = false
      if (again && active) {
        again = false
        void push()
      }
    }
  }

  const unsubscribeStore = store.subscribe((state, previous) => {
    const meta = state.syncMeta[userId]
    if (!meta?.dirty || meta.updatedAt === previous.syncMeta[userId]?.updatedAt) return
    schedule()
  })

  const unsubscribeRemote = onSnapshot(userRef, { includeMetadataChanges: true }, (snapshot) => {
    if (!active || snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return
    // A save of ours is on its way; its transaction reconciles with the
    // account, and the snapshot after it reflects the result.
    if (inFlight || timer) return
    const state = store.getState()
    const remote = readRemoteOutpatientPrefs(snapshot.data())
    const local = state.byUser[userId]
    const meta = state.syncMeta[userId]
    // A read that works clears an old read error; a failed save stays shown
    // until a save succeeds.
    if (!meta?.dirty) state.setSyncStatus(userId, 'synced')

    if (!remote) {
      // Nothing in the account yet: this browser's copy of THIS account
      // becomes it. Another account's, the anonymous or the guest settings
      // are never carried into an account.
      if (local && (!meta || meta.dirty || meta.baseUpdatedAt === null)) void push()
      return
    }
    if (!local) {
      state.replace(userId, remote.prefs, { updatedAt: remote.updatedAt, dirty: false, baseUpdatedAt: remote.updatedAt })
      return
    }
    if (!meta || meta.baseUpdatedAt === null) {
      // First sync of this account in this browser, with settings made here
      // before: keep both, the account's choices first.
      const merged = mergeOutpatientPrefs(remote.prefs, local)
      if (samePrefs(merged, remote.prefs)) {
        state.replace(userId, remote.prefs, { updatedAt: remote.updatedAt, dirty: false, baseUpdatedAt: remote.updatedAt })
      } else {
        state.replace(userId, merged, { updatedAt: remote.updatedAt + 1, dirty: true, baseUpdatedAt: remote.updatedAt })
      }
      return
    }
    if (meta.dirty) {
      void push()
      return
    }
    if (remote.updatedAt !== meta.baseUpdatedAt) {
      state.replace(userId, remote.prefs, { updatedAt: remote.updatedAt, dirty: false, baseUpdatedAt: remote.updatedAt })
    }
  }, (error) => {
    console.warn('[Outpatient prefs sync] Could not read the account:', error)
    if (active) store.getState().setSyncStatus(userId, 'error')
  })

  return () => {
    active = false
    if (timer) clearTimeout(timer)
    timer = null
    unsubscribeStore()
    unsubscribeRemote()
  }
}
