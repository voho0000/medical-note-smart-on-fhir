/**
 * Which of today's answers were brought in from a saved CDSS record, and from
 * which day's record.
 *
 * The answer stores keep values; they do not say where a value came from. A
 * carried answer counts as today's answer — the decision map has to be able
 * to read it — so the screen has to say, beside it, 「帶入 · 10/07」: the
 * clinician did not give it today, and it is theirs to confirm or change.
 *
 * Each mark remembers the value it was carried with. It stands only while the
 * answer still holds that value, so changing an answer takes its mark away
 * without every answer store having to know about carrying. Marks belong to the
 * day they were made: tomorrow they go, as the visit's own answers do.
 *
 * Kept per patient, encrypted under the tab-session key like the answers they
 * describe (see `patient-answer-backing`).
 */
import { create } from 'zustand'
import { createHydrationGuard } from '@/src/application/services/encrypted-answer-cache.service'
import { patientAnswerBacking } from './patient-answer-backing'
import { todayIsoDate } from './clinic-vitals.store'

/** One carried answer: the value it arrived with and the saved record's day (YYYY-MM-DD). */
export interface CarriedMark {
  value: string
  from: string
}

export interface CarriedAnswers {
  /** The day the marks were made; marks from another day are dropped. */
  on: string
  marks: Readonly<Record<string, CarriedMark>>
}

const EMPTY: CarriedAnswers = Object.freeze({ on: '', marks: Object.freeze({}) })
const DAY = /^\d{4}-\d{2}-\d{2}$/

/** The comparable form of an answer value, whatever store it lives in. */
export function carriedValue(value: unknown): string {
  return JSON.stringify(value ?? null)
}

function toCarried(parsed: unknown, today: string): CarriedAnswers {
  try {
    const record = parsed as Record<string, unknown>
    if (!record || record.on !== today || !record.marks || typeof record.marks !== 'object') return EMPTY
    const marks: Record<string, CarriedMark> = {}
    for (const [key, mark] of Object.entries(record.marks as Record<string, unknown>)) {
      const item = mark as Record<string, unknown>
      if (item && typeof item.value === 'string' && typeof item.from === 'string' && DAY.test(item.from)) {
        marks[key] = { value: item.value, from: item.from }
      }
    }
    return { on: today, marks }
  } catch {
    return EMPTY
  }
}

const hydration = createHydrationGuard()

interface CarriedAnswersState {
  byPatientId: Readonly<Record<string, CarriedAnswers>>
  hydratedPatientIds: Readonly<Record<string, true>>
  hydrate: (patientId: string, now?: Date) => void
  /** Adds marks for answers just carried in; `from` is the saved record's day. */
  mark: (patientId: string, values: Readonly<Record<string, unknown>>, from: string, now?: Date) => void
  clear: (patientId: string) => void
}

export const useCarriedAnswersStore = create<CarriedAnswersState>()((set, get) => ({
  byPatientId: {},
  hydratedPatientIds: {},

  hydrate: (patientId, now = new Date()) => {
    if (!patientId || get().hydratedPatientIds[patientId] || hydration.isPending(patientId)) return
    if (get().byPatientId[patientId] || !patientAnswerBacking().has('carried-answers', patientId)) {
      set(state => ({ hydratedPatientIds: { ...state.hydratedPatientIds, [patientId]: true } }))
      return
    }
    const settle = hydration.begin(patientId)
    const apply = (record: CarriedAnswers) => {
      if (!settle()) return
      set(state => ({
        byPatientId: state.byPatientId[patientId] ? state.byPatientId : { ...state.byPatientId, [patientId]: record },
        hydratedPatientIds: { ...state.hydratedPatientIds, [patientId]: true },
      }))
    }
    void patientAnswerBacking().load('carried-answers', patientId)
      .then(stored => apply(toCarried(stored, todayIsoDate(now))))
      .catch(() => apply(EMPTY))
  },

  mark: (patientId, values, from, now = new Date()) => {
    if (!patientId || !DAY.test(from) || !Object.keys(values).length) return
    const today = todayIsoDate(now)
    set(state => {
      const current = state.byPatientId[patientId]
      const kept = current?.on === today ? current.marks : {}
      const added = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value: carriedValue(value), from }]))
      const next: CarriedAnswers = { on: today, marks: { ...kept, ...added } }
      patientAnswerBacking().save('carried-answers', patientId, next)
      return { byPatientId: { ...state.byPatientId, [patientId]: next } }
    })
  },

  clear: (patientId) => {
    if (!patientId) return
    patientAnswerBacking().discard('carried-answers', patientId)
    set(state => ({ byPatientId: { ...state.byPatientId, [patientId]: EMPTY } }))
  },
}))

/**
 * The saved record's day an answer was carried from, while the answer still
 * holds the carried value today; otherwise null.
 */
export function carriedFrom(record: CarriedAnswers | undefined, key: string, current: unknown, now: Date = new Date()): string | null {
  if (!record || record.on !== todayIsoDate(now)) return null
  const mark = record.marks[key]
  return mark && current !== undefined && current !== null && mark.value === carriedValue(current) ? mark.from : null
}

/** One patient's carry marks, referentially stable between changes. */
export function useCarriedAnswers(patientId: string | undefined): CarriedAnswers {
  return useCarriedAnswersStore(state => (patientId ? state.byPatientId[patientId] : undefined) ?? EMPTY)
}
