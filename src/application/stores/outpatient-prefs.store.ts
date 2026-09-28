// 門診偏好 — the clinician's own outpatient reading and copy habits: which
// analytes the overview pins, and the plain-text formats they paste back into
// their EMR.
//
// Only SETTINGS live here — concept ids, literal template text and field
// placeholders. No patient value, date, report text or resource id is ever
// stored (see memory/feedback_persistence_policy_no_phi.md); every patient
// result is recomputed from the loaded chart each time.
//
// Stored per visitor key (account uid, anonymous uid, or a shared guest key —
// the same resolution the Beta switch uses). A signed-in account's settings
// also go to that account (users/{uid}.outpatientPrefs, see
// outpatient-prefs-sync.ts), so every device signed in to it shows the same;
// anonymous and guest settings stay on this computer, and the UI says so.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const GUEST_OUTPATIENT_PREFS_KEY = 'guest'

export function resolveOutpatientPrefsKey(
  signedInUid?: string | null,
  anonymousUid?: string | null,
): string {
  return signedInUid || anonymousUid || GUEST_OUTPATIENT_PREFS_KEY
}

export type OverviewLabMode = 'abnormal' | 'pinned' | 'mine' | 'all'
const LAB_MODES: OverviewLabMode[] = ['abnormal', 'pinned', 'mine', 'all']

export type EmrHandoffMode = 'custom' | 'builtin'

export type EmrLabField = 'name' | 'value' | 'unit' | 'date' | 'flag'
export type EmrExamKind = 'echo' | 'ecg'
export type EmrExamField = 'title' | 'date' | 'org' | 'conclusion' | 'text'

export const EMR_LAB_FIELDS: EmrLabField[] = ['name', 'value', 'unit', 'date', 'flag']
export const EMR_EXAM_KINDS: EmrExamKind[] = ['echo', 'ecg']
export const EMR_EXAM_FIELDS: EmrExamField[] = ['title', 'date', 'org', 'conclusion', 'text']

/** 最近 N 次 for a lab's value or date field ("1.2→1.3→1.5"). Absent = one. */
export const EMR_LAB_RECENT_COUNTS = [2, 3, 4, 5] as const
/** Fields that can print a series. */
export const EMR_LAB_SERIES_FIELDS: EmrLabField[] = ['value', 'date']

/** One piece of a copy format. Text is kept verbatim — spaces, slashes,
 *  CJK punctuation — and a newline is its own token. */
export type EmrFormatToken =
  | { kind: 'text'; text: string }
  | { kind: 'newline' }
  | { kind: 'lab'; lab: string; field: EmrLabField; count?: number }
  | { kind: 'exam'; exam: EmrExamKind; field: EmrExamField }

/** 同一行的檢驗: all from one collection day, or each its own latest. */
export type EmrLabRule = 'sameDay' | 'eachLatest'
export type EmrDateStyle = 'md' | 'ymd' | 'roc'
/** A line whose every lab has no result at all: leave it out of the paste
 *  (reported under the preview) or print it with the missing text. */
export type EmrEmptyLines = 'omit' | 'show'

export interface EmrCustomFormat {
  id: string
  name: string
  tokens: EmrFormatToken[]
  labRule: EmrLabRule
  /** Printed where a lab has no result for the line's day. User-chosen. */
  missingText: string
  dateStyle: EmrDateStyle
  emptyLines: EmrEmptyLines
}

export interface OutpatientPrefs {
  /** Pinned analyte ids (`chem:CREA`) and reminder rows (`note:…`), in the
   *  clinician's order. `null` = never customised. */
  pinnedLabs: string[] | null
  /** Last overview lab mode chosen, so 「自訂」 is what the next patient
   *  opens with. */
  labMode: OverviewLabMode | null
  formats: EmrCustomFormat[]
  activeFormatId: string | null
  handoffMode: EmrHandoffMode | null
}

export const EMPTY_OUTPATIENT_PREFS: OutpatientPrefs = {
  pinnedLabs: null,
  labMode: null,
  formats: [],
  activeFormatId: null,
  handoffMode: null,
}

const MAX_PINNED = 60
const MAX_FORMATS = 20
const MAX_TOKENS = 2000
const MAX_TEXT = 500

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function sanitizeToken(raw: unknown): EmrFormatToken | null {
  if (!raw || typeof raw !== 'object') return null
  const token = raw as Record<string, unknown>
  switch (token.kind) {
    case 'text':
      return isString(token.text) && token.text.length > 0
        ? { kind: 'text', text: token.text.slice(0, MAX_TEXT) }
        : null
    case 'newline':
      return { kind: 'newline' }
    case 'lab': {
      if (!isString(token.lab) || !token.lab.includes(':') || !EMR_LAB_FIELDS.includes(token.field as EmrLabField)) return null
      const field = token.field as EmrLabField
      const count = EMR_LAB_SERIES_FIELDS.includes(field) && (EMR_LAB_RECENT_COUNTS as readonly unknown[]).includes(token.count)
        ? token.count as number
        : undefined
      return { kind: 'lab', lab: token.lab, field, ...(count ? { count } : {}) }
    }
    case 'exam':
      return EMR_EXAM_KINDS.includes(token.exam as EmrExamKind) && EMR_EXAM_FIELDS.includes(token.field as EmrExamField)
        ? { kind: 'exam', exam: token.exam as EmrExamKind, field: token.field as EmrExamField }
        : null
    default:
      return null
  }
}

export function sanitizeEmrFormat(raw: unknown): EmrCustomFormat | null {
  if (!raw || typeof raw !== 'object') return null
  const format = raw as Record<string, unknown>
  if (!isString(format.id) || !format.id) return null
  const tokens = Array.isArray(format.tokens)
    ? format.tokens.slice(0, MAX_TOKENS).map(sanitizeToken).filter((t): t is EmrFormatToken => t !== null)
    : []
  return {
    id: format.id,
    name: isString(format.name) ? format.name.slice(0, 80) : '',
    tokens,
    labRule: format.labRule === 'eachLatest' ? 'eachLatest' : 'sameDay',
    missingText: isString(format.missingText) ? format.missingText.slice(0, 40) : '—',
    dateStyle: format.dateStyle === 'ymd' || format.dateStyle === 'roc' ? format.dateStyle : 'md',
    emptyLines: format.emptyLines === 'show' ? 'show' : 'omit',
  }
}

/** Anything unrecognised — older build, hand-edited storage — falls back to
 *  the default rather than dead-ending the overview or the copy panel. */
export function sanitizeOutpatientPrefs(raw: unknown): OutpatientPrefs {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_OUTPATIENT_PREFS }
  const prefs = raw as Record<string, unknown>
  const pinnedLabs = Array.isArray(prefs.pinnedLabs)
    ? [...new Set(prefs.pinnedLabs.filter((id): id is string => isString(id) && id.includes(':')))].slice(0, MAX_PINNED)
    : null
  const formats = Array.isArray(prefs.formats)
    ? prefs.formats.map(sanitizeEmrFormat).filter((f): f is EmrCustomFormat => f !== null).slice(0, MAX_FORMATS)
    : []
  const activeFormatId = isString(prefs.activeFormatId) && formats.some((f) => f.id === prefs.activeFormatId)
    ? prefs.activeFormatId
    : formats[0]?.id ?? null
  return {
    pinnedLabs,
    labMode: LAB_MODES.includes(prefs.labMode as OverviewLabMode) ? prefs.labMode as OverviewLabMode : null,
    formats,
    activeFormatId,
    handoffMode: prefs.handoffMode === 'custom' || prefs.handoffMode === 'builtin' ? prefs.handoffMode : null,
  }
}

/** Where this browser's copy of an account's settings stands against the
 *  account. Kept per key; only account keys are ever synced. */
export interface OutpatientPrefsSyncMeta {
  /** When these settings last changed here — or, after the account copy was
   *  applied, that copy's own stamp. */
  updatedAt: number
  /** Changed here and not yet confirmed saved to the account. Survives a
   *  reload, so an edit made offline or just before closing still goes up. */
  dirty: boolean
  /** Stamp of the account copy these settings were last based on; null until
   *  this browser has synced this account once. */
  baseUpdatedAt: number | null
  /** That account copy itself — what both this browser and any other device
   *  started from, so a merge can tell which side changed what. */
  base: OutpatientPrefs | null
}

/** 'error' = the account refused the write or could not be read; the
 *  settings stay in this browser and go up with the next change or read. */
export type OutpatientPrefsSyncStatus = 'synced' | 'error'

interface OutpatientPrefsStore {
  byUser: Record<string, OutpatientPrefs>
  syncMeta: Record<string, OutpatientPrefsSyncMeta>
  /** Not persisted: this session's connection only. */
  syncStatus: Record<string, OutpatientPrefsSyncStatus>
  update: (key: string, patch: Partial<OutpatientPrefs>) => void
  /** Sync only: put settings in place with the given meta, without marking
   *  them as a change made here. */
  replace: (key: string, prefs: OutpatientPrefs, meta: OutpatientPrefsSyncMeta) => void
  setSyncMeta: (key: string, meta: OutpatientPrefsSyncMeta) => void
  setSyncStatus: (key: string, status: OutpatientPrefsSyncStatus) => void
}

function sanitizeSyncMeta(raw: unknown): OutpatientPrefsSyncMeta | null {
  if (!raw || typeof raw !== 'object') return null
  const meta = raw as Record<string, unknown>
  if (typeof meta.updatedAt !== 'number' || !Number.isFinite(meta.updatedAt)) return null
  // A stamp without the copy it names cannot anchor a merge: treat this
  // browser as never synced rather than guess what the account held.
  const synced = typeof meta.baseUpdatedAt === 'number' && Number.isFinite(meta.baseUpdatedAt)
    && !!meta.base && typeof meta.base === 'object'
  return {
    updatedAt: meta.updatedAt,
    dirty: meta.dirty === true,
    baseUpdatedAt: synced ? meta.baseUpdatedAt as number : null,
    base: synced ? sanitizeOutpatientPrefs(meta.base) : null,
  }
}

export const useOutpatientPrefsStore = create<OutpatientPrefsStore>()(
  persist(
    (set) => ({
      byUser: {},
      syncMeta: {},
      syncStatus: {},
      update: (key, patch) => set((state) => {
        const previous = state.syncMeta[key]
        // Strictly after the previous stamp, so two edits in one millisecond
        // (or a clock set back) still read as the newer change.
        const updatedAt = Math.max(Date.now(), (previous?.updatedAt ?? 0) + 1)
        return {
          byUser: {
            ...state.byUser,
            [key]: sanitizeOutpatientPrefs({ ...(state.byUser[key] ?? EMPTY_OUTPATIENT_PREFS), ...patch }),
          },
          syncMeta: {
            ...state.syncMeta,
            [key]: {
              updatedAt,
              dirty: true,
              baseUpdatedAt: previous?.baseUpdatedAt ?? null,
              base: previous?.base ?? null,
            },
          },
        }
      }),
      replace: (key, prefs, meta) => set((state) => ({
        byUser: { ...state.byUser, [key]: sanitizeOutpatientPrefs(prefs) },
        syncMeta: { ...state.syncMeta, [key]: meta },
      })),
      setSyncMeta: (key, meta) => set((state) => ({ syncMeta: { ...state.syncMeta, [key]: meta } })),
      setSyncStatus: (key, status) => set((state) => (
        state.syncStatus[key] === status ? state : { syncStatus: { ...state.syncStatus, [key]: status } }
      )),
    }),
    {
      name: 'mediprisma-outpatient-prefs',
      version: 1,
      partialize: (state) => ({ byUser: state.byUser, syncMeta: state.syncMeta }),
      merge: (persisted, current) => {
        const stored = persisted as { byUser?: unknown; syncMeta?: unknown } | undefined
        const byUser: Record<string, OutpatientPrefs> = {}
        if (stored?.byUser && typeof stored.byUser === 'object') {
          for (const [key, value] of Object.entries(stored.byUser as Record<string, unknown>)) {
            byUser[key] = sanitizeOutpatientPrefs(value)
          }
        }
        const syncMeta: Record<string, OutpatientPrefsSyncMeta> = {}
        if (stored?.syncMeta && typeof stored.syncMeta === 'object') {
          for (const [key, value] of Object.entries(stored.syncMeta as Record<string, unknown>)) {
            const meta = sanitizeSyncMeta(value)
            if (meta && byUser[key]) syncMeta[key] = meta
          }
        }
        return { ...current, byUser, syncMeta }
      },
    },
  ),
)
