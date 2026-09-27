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
// the same resolution the Beta switch uses), in this browser only. Nothing is
// synced to the cloud yet, and the UI says so.

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

/** One piece of a copy format. Text is kept verbatim — spaces, slashes,
 *  CJK punctuation — and a newline is its own token. */
export type EmrFormatToken =
  | { kind: 'text'; text: string }
  | { kind: 'newline' }
  | { kind: 'lab'; lab: string; field: EmrLabField }
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
  /** Last overview lab mode chosen, so 「我的固定」 is what the next patient
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
    case 'lab':
      return isString(token.lab) && token.lab.includes(':') && EMR_LAB_FIELDS.includes(token.field as EmrLabField)
        ? { kind: 'lab', lab: token.lab, field: token.field as EmrLabField }
        : null
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

interface OutpatientPrefsStore {
  byUser: Record<string, OutpatientPrefs>
  update: (key: string, patch: Partial<OutpatientPrefs>) => void
}

export const useOutpatientPrefsStore = create<OutpatientPrefsStore>()(
  persist(
    (set) => ({
      byUser: {},
      update: (key, patch) => set((state) => ({
        byUser: {
          ...state.byUser,
          [key]: sanitizeOutpatientPrefs({ ...(state.byUser[key] ?? EMPTY_OUTPATIENT_PREFS), ...patch }),
        },
      })),
    }),
    {
      name: 'mediprisma-outpatient-prefs',
      version: 1,
      partialize: (state) => ({ byUser: state.byUser }),
      merge: (persisted, current) => {
        const stored = (persisted as { byUser?: unknown } | undefined)?.byUser
        const byUser: Record<string, OutpatientPrefs> = {}
        if (stored && typeof stored === 'object') {
          for (const [key, value] of Object.entries(stored as Record<string, unknown>)) {
            byUser[key] = sanitizeOutpatientPrefs(value)
          }
        }
        return { ...current, byUser }
      },
    },
  ),
)
