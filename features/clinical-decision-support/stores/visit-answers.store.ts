/**
 * What the clinician answered in the room, for any disease's visit flow.
 *
 * Heart failure answers through two stores of its own — `clinic-vitals` for
 * the measurements and the congestion terms, `phenotype-answer` for the gate —
 * because those shapes are heart failure's own clinical concepts and the
 * modules that read them are written against those keys. Every disease after
 * it answers here instead: a question id, either a set of per-item 有／無／未
 * 評估 answers or a single choice, and the day the answer last changed.
 *
 * Three states, and only two of them are ever written out as facts. 「有」 and
 * 「無」 are answers; `NOT_ASSESSED` is the third — the question was put and
 * no finding was recorded — and it produces no fact, because a pack must never
 * read silence as a negative. A question with no entry at all was not asked.
 *
 * Kept encrypted under this tab's session key, keyed by pack and patient, like
 * the rest of this feature's answers: an answer survives a reload of this tab,
 * no other session can read it, and carrying it to the next visit is phase 2.
 * Nothing is written to the chart and nothing leaves the browser.
 */
import { create } from 'zustand'
import {
  createHydrationGuard,
  discardEncryptedAnswers,
  hasEncryptedAnswers,
  loadEncryptedAnswers,
  persistEncryptedAnswers,
} from '@/src/application/services/encrypted-answer-cache.service'

/** 「已評估過，答案是未評估」, which is not 「還沒問」 and is never a negative. */
export const NOT_ASSESSED = 'not-assessed'

export type VisitItemAnswerValue = 'present' | 'absent' | typeof NOT_ASSESSED

export interface VisitQuestionAnswer {
  /** Per-row answers, for a question that asks a list. */
  items?: Readonly<Record<string, VisitItemAnswerValue>>
  /** The single choice, for a question that asks one. */
  value?: string
  /** When this browser last recorded a change, as an ISO timestamp. */
  modifiedAt: string
}

/** Keyed by question id. */
export type VisitAnswers = Readonly<Record<string, VisitQuestionAnswer>>

export const EMPTY_VISIT_ANSWERS: VisitAnswers = Object.freeze({})

/**
 * A statement about one question. `null` on an item returns that row to
 * 「還沒問」; `value: null` returns the choice to unanswered.
 */
export interface VisitAnswerPatch {
  questionId: string
  items?: Readonly<Record<string, VisitItemAnswerValue | null>>
  value?: string | null
}

/**
 * The answers after a patch, or the answers themselves when nothing changed.
 *
 * Saving the same answer again is not a new answer, so 「最後修改」 dates the
 * change rather than the click — the rule every other answer store keeps.
 */
export function mergeVisitAnswers(
  current: VisitAnswers | undefined,
  patch: VisitAnswerPatch,
  now: Date = new Date(),
): VisitAnswers {
  const base = current ?? EMPTY_VISIT_ANSWERS
  const existing = base[patch.questionId]
  const items: Record<string, VisitItemAnswerValue> = { ...(existing?.items ?? {}) }
  let changed = false

  for (const [term, value] of Object.entries(patch.items ?? {})) {
    if (value === null) {
      if (items[term] !== undefined) {
        delete items[term]
        changed = true
      }
      continue
    }
    if (items[term] === value) continue
    items[term] = value
    changed = true
  }

  let value = existing?.value
  if (patch.value !== undefined) {
    const next = patch.value === null ? undefined : patch.value
    if (next !== value) {
      value = next
      changed = true
    }
  }

  if (!changed) return base

  const hasItems = Object.keys(items).length > 0
  if (!hasItems && value === undefined) {
    const { [patch.questionId]: _removed, ...rest } = base
    return rest
  }
  return {
    ...base,
    [patch.questionId]: {
      ...(hasItems ? { items } : {}),
      ...(value === undefined ? {} : { value }),
      modifiedAt: now.toISOString(),
    },
  }
}

const STORAGE_PREFIX = 'cdss-visit-answers:'

/** The key one patient's encrypted answers for one pack are kept under. */
export function visitAnswersStorageKey(packId: string, patientId: string): string {
  return `${STORAGE_PREFIX}${packId}:${patientId}`
}

/** One store serves every pack, so the in-memory key carries the pack too. */
function scopeKey(packId: string, patientId: string): string {
  return `${packId}:${patientId}`
}

/**
 * Storage is a best-effort cache, never a source of clinical truth: a private
 * window throws on write, a quota can be full, a session that cannot decrypt
 * hands back nothing, and a hand-edited value can be anything. Every path
 * degrades to 「沒答」, which is a first visit's reading.
 */
function toVisitAnswers(parsed: unknown): VisitAnswers {
  try {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return EMPTY_VISIT_ANSWERS
    const answers: Record<string, VisitQuestionAnswer> = {}
    for (const [questionId, raw] of Object.entries(parsed as Record<string, unknown>)) {
      if (!raw || typeof raw !== 'object') continue
      const record = raw as Record<string, unknown>
      const items: Record<string, VisitItemAnswerValue> = {}
      if (record.items && typeof record.items === 'object') {
        for (const [term, value] of Object.entries(record.items as Record<string, unknown>)) {
          if (value === 'present' || value === 'absent' || value === NOT_ASSESSED) items[term] = value
        }
      }
      const value = typeof record.value === 'string' && record.value ? record.value : undefined
      if (Object.keys(items).length === 0 && value === undefined) continue
      answers[questionId] = {
        ...(Object.keys(items).length > 0 ? { items } : {}),
        ...(value === undefined ? {} : { value }),
        modifiedAt: typeof record.modifiedAt === 'string' ? record.modifiedAt : '',
      }
    }
    return answers
  } catch {
    return EMPTY_VISIT_ANSWERS
  }
}

function writeStored(packId: string, patientId: string, answers: VisitAnswers): void {
  const key = visitAnswersStorageKey(packId, patientId)
  if (Object.keys(answers).length === 0) {
    discardEncryptedAnswers(key)
    return
  }
  persistEncryptedAnswers(key, answers)
}

const hydration = createHydrationGuard()

interface VisitAnswersState {
  byScope: Readonly<Record<string, VisitAnswers>>
  /** Which pack-and-chart pairs have been read back, so a question can tell
   *  「沒答」 from 「還沒讀到」 instead of drawing itself unanswered. */
  hydratedScopes: Readonly<Record<string, true>>
  hydrate: (packId: string, patientId: string) => void
  setAnswer: (packId: string, patientId: string, patch: VisitAnswerPatch, now?: Date) => void
  clearAnswers: (packId: string, patientId: string) => void
}

export const useVisitAnswersStore = create<VisitAnswersState>()((set, get) => ({
  byScope: {},
  hydratedScopes: {},

  hydrate: (packId, patientId) => {
    if (!packId || !patientId) return
    const scope = scopeKey(packId, patientId)
    const state = get()
    if (state.hydratedScopes[scope] || hydration.isPending(scope)) return

    // Answers already in memory are this session's own, and a chart with no
    // stored record is a first visit. Neither needs a decryption.
    if (state.byScope[scope] || !hasEncryptedAnswers(visitAnswersStorageKey(packId, patientId))) {
      set((current) => ({
        byScope: current.byScope[scope]
          ? current.byScope
          : { ...current.byScope, [scope]: EMPTY_VISIT_ANSWERS },
        hydratedScopes: { ...current.hydratedScopes, [scope]: true },
      }))
      return
    }

    const settle = hydration.begin(scope)
    const apply = (answers: VisitAnswers) => {
      if (!settle()) return
      set((current) => ({
        // An answer given while the read was in flight is more recent than
        // storage; it stands.
        byScope: current.byScope[scope]
          ? current.byScope
          : { ...current.byScope, [scope]: answers },
        hydratedScopes: { ...current.hydratedScopes, [scope]: true },
      }))
    }
    void loadEncryptedAnswers<unknown>(visitAnswersStorageKey(packId, patientId))
      .then((stored) => apply(toVisitAnswers(stored)))
      // A record that cannot be read leaves every question unanswered, which
      // is a first visit's reading.
      .catch(() => apply(EMPTY_VISIT_ANSWERS))
  },

  setAnswer: (packId, patientId, patch, now = new Date()) => {
    if (!packId || !patientId) return
    const scope = scopeKey(packId, patientId)
    set((state) => {
      const current = state.byScope[scope]
      const next = mergeVisitAnswers(current, patch, now)
      // Nothing changed — and where there was nothing in memory to change,
      // `next` is the frozen empty record, which must not be written over a
      // stored one this session has not read back yet.
      if (next === current || next === EMPTY_VISIT_ANSWERS) return state
      // In memory first; the encryption runs in the background and cannot
      // reach back into what the screen is already showing.
      writeStored(packId, patientId, next)
      return { byScope: { ...state.byScope, [scope]: next } }
    })
  },

  clearAnswers: (packId, patientId) => {
    if (!packId || !patientId) return
    const scope = scopeKey(packId, patientId)
    discardEncryptedAnswers(visitAnswersStorageKey(packId, patientId))
    set((state) => ({
      byScope: { ...state.byScope, [scope]: EMPTY_VISIT_ANSWERS },
      hydratedScopes: { ...state.hydratedScopes, [scope]: true },
    }))
  },
}))

/** One chart's answers for one pack, referentially stable between changes. */
export function useVisitAnswers(
  packId: string | undefined,
  patientId: string | undefined,
): VisitAnswers | undefined {
  return useVisitAnswersStore((state) => (
    packId && patientId ? state.byScope[scopeKey(packId, patientId)] : undefined
  ))
}

/** Whether this chart's answers for this pack have been read back yet. */
export function useVisitAnswersHydrated(
  packId: string | undefined,
  patientId: string | undefined,
): boolean {
  return useVisitAnswersStore((state) => (
    !packId || !patientId || Boolean(state.hydratedScopes[scopeKey(packId, patientId)])
  ))
}

/** A record built from one statement, for a caller with no store. */
export function buildVisitAnswers(
  patches: readonly VisitAnswerPatch[],
  now: Date = new Date(),
): VisitAnswers {
  return patches.reduce<VisitAnswers>(
    (answers, patch) => mergeVisitAnswers(answers, patch, now),
    EMPTY_VISIT_ANSWERS,
  )
}
