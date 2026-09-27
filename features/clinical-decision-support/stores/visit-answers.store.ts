/**
 * The every-visit questions, answered, per patient.
 *
 * The decision map asks the same two things at every visit — breathlessness
 * and weight on the heart-failure page, symptoms and bleeding on the
 * atrial-fibrillation page. The answer is a clinical statement about a named
 * person, so it is kept the way the rest of this feature's answers are:
 * encrypted under this tab's session key, keyed by patient, never readable in
 * plain text by the next person at the workstation (see
 * `encrypted-answer-cache.service`).
 *
 * An answer is this visit's answer. One read back from an earlier day is
 * dropped on hydration rather than applied, because 「喘變差」 last week says
 * nothing about today. Nothing here is written to the chart; the answers reach
 * the pack only through `applyVisitAnswers`, as facts on the profile.
 */
import { create } from 'zustand'
import {
  createHydrationGuard,
  discardEncryptedAnswers,
  hasEncryptedAnswers,
  loadEncryptedAnswers,
  persistEncryptedAnswers,
} from '@/src/application/services/encrypted-answer-cache.service'
import type { VisitAnswers, VisitAsk } from '../types'

export type VisitAskId = VisitAsk['id']

/**
 * The answer values the pack reads, per ask — the literal unions of its
 * `VisitAnswers`, spelled out so a stored value outside them never reaches the
 * pack. Typed against the pack's own type: if it renames a value, this stops
 * compiling instead of silently dropping answers.
 */
const ANSWER_VALUES: { readonly [K in VisitAskId]-?: readonly NonNullable<VisitAnswers[K]>[] } = {
  'dyspnoea-trend': ['worse', 'stable', 'better'],
  'weight-trend': ['up', 'same', 'down'],
  'af-symptoms': ['yes', 'no'],
  bleeding: ['yes', 'no'],
}

const ASK_IDS = Object.keys(ANSWER_VALUES) as VisitAskId[]

function isAskId(value: string): value is VisitAskId {
  return ASK_IDS.some((id) => id === value)
}

function isAnswerValue(id: VisitAskId, value: string): boolean {
  return (ANSWER_VALUES[id] as readonly string[]).includes(value)
}

/** One answer and when it was given, as an ISO timestamp. */
export interface VisitAnswerEntry {
  value: string
  answeredAt: string
}

export type VisitAnswerRecord = Readonly<Partial<Record<VisitAskId, VisitAnswerEntry>>>

const EMPTY_RECORD: VisitAnswerRecord = Object.freeze({})
const EMPTY_ANSWERS: VisitAnswers = Object.freeze({})

const STORAGE_PREFIX = 'cdss-visit-answers:'

/** The key one patient's encrypted visit answers are kept under. */
export function visitAnswersStorageKey(patientId: string): string {
  return `${STORAGE_PREFIX}${patientId}`
}

function localDay(value: Date): string {
  const y = value.getFullYear()
  const m = String(value.getMonth() + 1).padStart(2, '0')
  const d = String(value.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Storage is a best-effort cache, never a source of clinical truth. Anything
 * unreadable, unknown or from another day degrades to 「還沒問」.
 */
export function toVisitAnswerRecord(parsed: unknown, now: Date = new Date()): VisitAnswerRecord {
  try {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return EMPTY_RECORD
    const today = localDay(now)
    const record: Partial<Record<VisitAskId, VisitAnswerEntry>> = {}
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!isAskId(id) || !value || typeof value !== 'object') continue
      const entry = value as Record<string, unknown>
      if (typeof entry.value !== 'string' || !isAnswerValue(id, entry.value)) continue
      if (typeof entry.answeredAt !== 'string') continue
      const answeredAt = new Date(entry.answeredAt)
      if (Number.isNaN(answeredAt.getTime()) || localDay(answeredAt) !== today) continue
      record[id] = { value: entry.value, answeredAt: entry.answeredAt }
    }
    return Object.keys(record).length ? record : EMPTY_RECORD
  } catch {
    return EMPTY_RECORD
  }
}

/**
 * The answers alone, in the shape `applyVisitAnswers` takes, narrowed to the
 * values the pack reads.
 */
export function visitAnswersOf(record: VisitAnswerRecord | undefined): VisitAnswers {
  if (!record) return EMPTY_ANSWERS
  const answers: Record<string, string> = {}
  for (const id of ASK_IDS) {
    const entry = record[id]
    if (entry && isAnswerValue(id, entry.value)) answers[id] = entry.value
  }
  return Object.keys(answers).length ? (answers as VisitAnswers) : EMPTY_ANSWERS
}

function writeStored(patientId: string, record: VisitAnswerRecord): void {
  const key = visitAnswersStorageKey(patientId)
  if (Object.keys(record).length === 0) {
    discardEncryptedAnswers(key)
    return
  }
  persistEncryptedAnswers(key, record)
}

const hydration = createHydrationGuard()

interface VisitAnswersState {
  byPatientId: Readonly<Record<string, VisitAnswerRecord>>
  /** Which charts have been read back, so a question can tell 「還沒問」 from
   *  「還沒讀到」 instead of drawing unanswered and then jumping. */
  hydratedPatientIds: Readonly<Record<string, true>>
  hydrate: (patientId: string, now?: Date) => void
  /** Records an answer; `null` returns the question to unanswered (the
   *  record's own reading, where the pack has one, stands again). */
  answer: (patientId: string, id: VisitAskId, value: string | null, now?: Date) => void
  clearAnswers: (patientId: string) => void
}

export const useVisitAnswersStore = create<VisitAnswersState>()((set, get) => ({
  byPatientId: {},
  hydratedPatientIds: {},

  hydrate: (patientId, now = new Date()) => {
    if (!patientId) return
    const state = get()
    if (state.hydratedPatientIds[patientId] || hydration.isPending(patientId)) return

    if (state.byPatientId[patientId] || !hasEncryptedAnswers(visitAnswersStorageKey(patientId))) {
      set((current) => ({
        byPatientId: current.byPatientId[patientId]
          ? current.byPatientId
          : { ...current.byPatientId, [patientId]: EMPTY_RECORD },
        hydratedPatientIds: { ...current.hydratedPatientIds, [patientId]: true },
      }))
      return
    }

    const settle = hydration.begin(patientId)
    const apply = (record: VisitAnswerRecord) => {
      if (!settle()) return
      set((current) => ({
        // An answer given while the read was in flight is more recent than
        // storage; it stands.
        byPatientId: current.byPatientId[patientId]
          ? current.byPatientId
          : { ...current.byPatientId, [patientId]: record },
        hydratedPatientIds: { ...current.hydratedPatientIds, [patientId]: true },
      }))
    }
    void loadEncryptedAnswers<unknown>(visitAnswersStorageKey(patientId))
      .then((stored) => apply(toVisitAnswerRecord(stored, now)))
      .catch(() => apply(EMPTY_RECORD))
  },

  answer: (patientId, id, value, now = new Date()) => {
    if (!patientId || !isAskId(id)) return
    if (value !== null && value !== '' && !isAnswerValue(id, value)) return
    set((state) => {
      const current = state.byPatientId[patientId] ?? EMPTY_RECORD
      if (value === null || value === '') {
        if (!current[id]) return state
        const next = { ...current }
        delete next[id]
        writeStored(patientId, next)
        return { byPatientId: { ...state.byPatientId, [patientId]: next } }
      }
      if (current[id]?.value === value) return state
      const next: VisitAnswerRecord = { ...current, [id]: { value, answeredAt: now.toISOString() } }
      // In memory first; the encryption runs in the background.
      writeStored(patientId, next)
      return { byPatientId: { ...state.byPatientId, [patientId]: next } }
    })
  },

  clearAnswers: (patientId) => {
    if (!patientId) return
    discardEncryptedAnswers(visitAnswersStorageKey(patientId))
    set((state) => ({
      byPatientId: { ...state.byPatientId, [patientId]: EMPTY_RECORD },
      hydratedPatientIds: { ...state.hydratedPatientIds, [patientId]: true },
    }))
  },
}))

/** One patient's answers, referentially stable between changes. */
export function useVisitAnswerRecord(patientId: string | undefined): VisitAnswerRecord {
  return useVisitAnswersStore(
    (state) => (patientId ? state.byPatientId[patientId] : undefined) ?? EMPTY_RECORD,
  )
}

/** Whether this chart's answers have been read back yet. */
export function useVisitAnswersHydrated(patientId: string | undefined): boolean {
  return useVisitAnswersStore(
    (state) => !patientId || Boolean(state.hydratedPatientIds[patientId]),
  )
}
