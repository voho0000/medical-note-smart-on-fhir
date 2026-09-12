/**
 * What was measured and answered in the room this visit, field by field.
 *
 * A clinic's blood pressure cuff, pulse and scale are often not synced to the
 * record the pack reads, so the freshest numbers a titration decision needs
 * are the ones the clinician has just written on paper. They are entered here
 * and handed to the pack as facts (see `applyClinicVitals`), so every module
 * that reads blood pressure, heart rate or weight recomputes from them —
 * nothing patches a rendered card. The same record carries the answers only a
 * person can give: the NYHA grade, the congestion signs, the compensation
 * judgement.
 *
 * Every field carries its own dates rather than sharing one visit-level
 * `measuredOn`. A weight measured today and an NYHA grade carried over from
 * August are two different statements, and a screen that dated them alike made
 * the older one look like today's examination. `measuredOn` is when the value
 * was obtained; `modifiedAt` is when this browser last recorded a change —
 * storing the same value again leaves it alone, so 「最後修改」 means what it
 * says.
 *
 * Kept per patient, encrypted under the tab-session key (see
 * `encrypted-answer-cache.service`), so a value survives a reload of this tab, never
 * follows the previous patient into the next chart, and cannot be read by the
 * next person to open the browser. Carrying an answer to the next visit is
 * phase 2. Nothing is written to the record and nothing leaves the browser.
 */
import { create } from 'zustand'
import {
  createHydrationGuard,
  discardEncryptedAnswers,
  hasEncryptedAnswers,
  loadEncryptedAnswers,
  persistEncryptedAnswers,
} from '@/src/application/services/encrypted-answer-cache.service'

/** The three one-tap groups the congestion question is asked in. */
export type CongestionSignsAnswer = 'edema' | 'orthopnea-pnd' | 'jvp-rales'

/**
 * The evidence-table terms each group stands for. These are the congestion
 * table's own term ids (`congestion:<term>` rows), so an answer lands on the
 * rows the pack already reads; nothing is judged here.
 */
export const CONGESTION_SIGN_TERMS: Readonly<Record<CongestionSignsAnswer, readonly string[]>> = {
  edema: ['pitting-edema'],
  'orthopnea-pnd': ['orthopnea', 'paroxysmal-nocturnal-dyspnea'],
  'jvp-rales': ['jvp', 'rales'],
}

/** NYHA functional class, as the clinician grades it. */
export type NyhaClass = 'I' | 'II' | 'III' | 'IV'

/**
 * Whether the patient is compensated in the room today, as the clinician
 * judges it.
 *
 * A judgement, not a code: the record's own `decompensatedHeartFailure` is read
 * from an HF admission inside a 90-day window, which answers 「最近住過院嗎」
 * rather than 「今天穩不穩」. The two are kept apart on purpose — a patient
 * admitted eleven weeks ago can walk in compensated, and one who has never been
 * admitted can walk in decompensated.
 */
export type CompensationStatus = 'compensated' | 'decompensated'

/**
 * 「未評估」, chosen on purpose.
 *
 * Distinct from an absent field, which is 「還沒問」. Both are unknown to the
 * pack — neither produces a fact — but only one of them is an answer, and the
 * screen has to be able to say 「這一題今天問過了」 without inventing a finding.
 */
export const NOT_ASSESSED = 'not-assessed'

export type SignAnswerValue = 'present' | 'absent' | typeof NOT_ASSESSED
export type NyhaAnswerValue = NyhaClass | typeof NOT_ASSESSED
export type CompensationAnswerValue = CompensationStatus | typeof NOT_ASSESSED

/** The measurements this form takes, in the order the form offers them. */
export const CLINIC_VITALS_ENTRY_KEYS = [
  'systolic',
  'diastolic',
  'heartRate',
  'oxygenSaturation',
  'bodyWeight',
  'bodyHeight',
] as const

export type ClinicVitalsEntryKey = (typeof CLINIC_VITALS_ENTRY_KEYS)[number]

/** One measured number, with the day it was taken and the day it was typed. */
export interface MeasuredEntry {
  value: number
  /** The day the measurement was taken, as YYYY-MM-DD. */
  measuredOn: string
  /** When this browser last recorded a change, as an ISO timestamp. */
  modifiedAt: string
}

/** One answered question, with the moment it was last changed. */
export interface AnsweredField<T> {
  value: T
  modifiedAt: string
}

export interface ClinicVitals {
  entries: Readonly<Partial<Record<ClinicVitalsEntryKey, MeasuredEntry>>>
  /** The NYHA class graded in the room; absent means nobody has been asked. */
  nyhaClass?: AnsweredField<NyhaAnswerValue>
  /**
   * One answer per sign, keyed by the canonical term the evidence table's rows
   * are matched on. 「有」, 「無」, 「未評估」 — or absent, which is 「沒問」.
   */
  signAnswers: Readonly<Record<string, AnsweredField<SignAnswerValue>>>
  /** The compensation state judged in the room, where one was judged. */
  compensationStatus?: AnsweredField<CompensationAnswerValue>
}

export const EMPTY_CLINIC_VITALS: ClinicVitals = Object.freeze({
  entries: Object.freeze({}),
  signAnswers: Object.freeze({}),
})

/**
 * A partial statement about this visit.
 *
 * Only the fields named are touched. `null` returns a field to 「沒問」, which
 * is not the same as answering 「未評估」 — an answer someone gave and withdrew
 * has to be able to return to unasked. Saving a field's current value again is
 * a no-op, so 「最後修改」 dates the change rather than the click.
 */
export interface ClinicVitalsPatch {
  entries?: Partial<Record<ClinicVitalsEntryKey, { value: number; measuredOn?: string } | null>>
  nyhaClass?: NyhaAnswerValue | null
  signAnswers?: Readonly<Record<string, SignAnswerValue | null>>
  compensationStatus?: CompensationAnswerValue | null
}

/** Today's date in the browser's local calendar, as YYYY-MM-DD. */
export function todayIsoDate(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

/**
 * The record after a partial statement, or the record itself when the
 * statement changed nothing.
 *
 * Pure, and exported: the store is one caller, and a test that wants to know
 * what 「同值再存一次」 does should not have to mount a store to ask.
 */
export function mergeClinicVitals(
  current: ClinicVitals | undefined,
  patch: ClinicVitalsPatch,
  now: Date = new Date(),
): ClinicVitals {
  const base = current ?? EMPTY_CLINIC_VITALS
  const modifiedAt = now.toISOString()
  let changed = false

  const entries: Partial<Record<ClinicVitalsEntryKey, MeasuredEntry>> = { ...base.entries }
  for (const [rawKey, entry] of Object.entries(patch.entries ?? {})) {
    const key = rawKey as ClinicVitalsEntryKey
    if (entry === null || entry === undefined) {
      if (entries[key]) {
        delete entries[key]
        changed = true
      }
      continue
    }
    if (!isFinitePositive(entry.value)) continue
    const measuredOn = entry.measuredOn ?? todayIsoDate(now)
    const existing = entries[key]
    if (existing && existing.value === entry.value && existing.measuredOn === measuredOn) continue
    entries[key] = { value: entry.value, measuredOn, modifiedAt }
    changed = true
  }

  const signAnswers: Record<string, AnsweredField<SignAnswerValue>> = { ...base.signAnswers }
  for (const [term, value] of Object.entries(patch.signAnswers ?? {})) {
    if (value === null || value === undefined) {
      if (signAnswers[term]) {
        delete signAnswers[term]
        changed = true
      }
      continue
    }
    if (signAnswers[term]?.value === value) continue
    signAnswers[term] = { value, modifiedAt }
    changed = true
  }

  const next: ClinicVitals = { entries, signAnswers }

  const carryAnswer = <T extends string>(
    key: 'nyhaClass' | 'compensationStatus',
    incoming: T | null | undefined,
  ) => {
    const existing = base[key] as AnsweredField<T> | undefined
    if (incoming === undefined) {
      if (existing) (next[key] as AnsweredField<T>) = existing
      return
    }
    if (incoming === null) {
      if (existing) changed = true
      return
    }
    if (existing?.value === incoming) {
      (next[key] as AnsweredField<T>) = existing
      return
    }
    ;(next[key] as AnsweredField<T>) = { value: incoming, modifiedAt }
    changed = true
  }
  carryAnswer('nyhaClass', patch.nyhaClass)
  carryAnswer('compensationStatus', patch.compensationStatus)

  return changed ? next : base
}

/** The patch that answers one congestion group, writing every term in it. */
export function congestionGroupPatch(
  group: CongestionSignsAnswer,
  value: SignAnswerValue | null,
): ClinicVitalsPatch {
  const signAnswers: Record<string, SignAnswerValue | null> = {}
  for (const term of CONGESTION_SIGN_TERMS[group] ?? []) signAnswers[term] = value
  return { signAnswers }
}

/**
 * What one group was answered, read back from its terms.
 *
 * Any sign seen makes the group 「有」; otherwise every answered term saying
 * 「無」 makes it 「無」; an explicit 「未評估」 stands where one was given; and
 * a group nobody has been asked about is `null`.
 */
export function congestionGroupAnswer(
  vitals: ClinicVitals | undefined,
  group: CongestionSignsAnswer,
): SignAnswerValue | null {
  const terms = CONGESTION_SIGN_TERMS[group] ?? []
  const answers = terms
    .map((term) => vitals?.signAnswers?.[term]?.value)
    .filter((value): value is SignAnswerValue => Boolean(value))
  if (answers.length === 0) return null
  if (answers.includes('present')) return 'present'
  if (answers.every((value) => value === 'absent')) return 'absent'
  return NOT_ASSESSED
}

/** The number entered for one measurement, if any. */
export function entryValue(
  vitals: ClinicVitals | undefined,
  key: ClinicVitalsEntryKey,
): number | undefined {
  return vitals?.entries?.[key]?.value
}

const STORAGE_PREFIX = 'cdss-clinic-vitals:'

/** The key one patient's encrypted visit record is kept under. */
export function clinicVitalsStorageKey(patientId: string): string {
  return `${STORAGE_PREFIX}${patientId}`
}

function toAnsweredField<T extends string>(
  raw: unknown,
  allowed: readonly T[],
): AnsweredField<T> | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const record = raw as Record<string, unknown>
  const value = record.value
  if (typeof value !== 'string' || !allowed.includes(value as T)) return undefined
  return {
    value: value as T,
    modifiedAt: typeof record.modifiedAt === 'string' ? record.modifiedAt : '',
  }
}

/**
 * Storage is a best-effort cache, never a source of clinical truth: Safari
 * private mode throws on write, a quota can be full, a session that cannot
 * decrypt hands back nothing, and a hand-edited value can be anything at all.
 * Every path therefore degrades to 「沒問」, which is the same reading a first
 * visit gives.
 */
function toClinicVitals(parsed: unknown): ClinicVitals {
  try {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return EMPTY_CLINIC_VITALS
    const record = parsed as Record<string, unknown>
    const entries: Partial<Record<ClinicVitalsEntryKey, MeasuredEntry>> = {}
    const rawEntries = (record.entries ?? {}) as Record<string, unknown>
    for (const key of CLINIC_VITALS_ENTRY_KEYS) {
      const entry = rawEntries[key]
      if (!entry || typeof entry !== 'object') continue
      const item = entry as Record<string, unknown>
      if (!isFinitePositive(item.value) || typeof item.measuredOn !== 'string') continue
      entries[key] = {
        value: item.value,
        measuredOn: item.measuredOn,
        modifiedAt: typeof item.modifiedAt === 'string' ? item.modifiedAt : '',
      }
    }
    const signAnswers: Record<string, AnsweredField<SignAnswerValue>> = {}
    for (const [term, value] of Object.entries((record.signAnswers ?? {}) as Record<string, unknown>)) {
      const answer = toAnsweredField(value, ['present', 'absent', NOT_ASSESSED] as const)
      if (answer) signAnswers[term] = answer
    }
    const nyhaClass = toAnsweredField(record.nyhaClass, ['I', 'II', 'III', 'IV', NOT_ASSESSED] as const)
    const compensationStatus = toAnsweredField(
      record.compensationStatus,
      ['compensated', 'decompensated', NOT_ASSESSED] as const,
    )
    return {
      entries,
      signAnswers,
      ...(nyhaClass ? { nyhaClass } : {}),
      ...(compensationStatus ? { compensationStatus } : {}),
    }
  } catch {
    return EMPTY_CLINIC_VITALS
  }
}

/** Empty is 「沒問」: nothing worth keeping, so the key goes rather than
 *  holding an encrypted record of no answers at all. */
function isEmptyVitals(vitals: ClinicVitals): boolean {
  return Object.keys(vitals.entries).length === 0
    && Object.keys(vitals.signAnswers).length === 0
    && !vitals.nyhaClass
    && !vitals.compensationStatus
}

function writeStoredVitals(patientId: string, vitals: ClinicVitals): void {
  const key = clinicVitalsStorageKey(patientId)
  if (isEmptyVitals(vitals)) {
    discardEncryptedAnswers(key)
    return
  }
  persistEncryptedAnswers(key, vitals)
}

const hydration = createHydrationGuard()

interface ClinicVitalsState {
  byPatientId: Readonly<Record<string, ClinicVitals>>
  /** Which charts have been read back, so the screen can tell 「沒答案」 from
   *  「還沒讀到」 and show the questions only once it knows which it is. */
  hydratedPatientIds: Readonly<Record<string, true>>
  /** Reads one patient's stored record once; a no-op after that. */
  hydrate: (patientId: string) => void
  setVitals: (patientId: string, patch: ClinicVitalsPatch, now?: Date) => void
  setCongestionGroup: (
    patientId: string,
    group: CongestionSignsAnswer,
    value: SignAnswerValue | null,
    now?: Date,
  ) => void
  clearVitals: (patientId: string) => void
}

export const useClinicVitalsStore = create<ClinicVitalsState>()((set, get) => ({
  byPatientId: {},
  hydratedPatientIds: {},

  hydrate: (patientId) => {
    if (!patientId) return
    const state = get()
    if (state.hydratedPatientIds[patientId] || hydration.isPending(patientId)) return

    // Two cases need no decryption: an answer already in memory is this
    // session's own and more recent than anything storage holds, and a chart
    // with no stored record is a first visit. Neither writes anything.
    if (state.byPatientId[patientId] || !hasEncryptedAnswers(clinicVitalsStorageKey(patientId))) {
      set((current) => ({
        byPatientId: current.byPatientId[patientId]
          ? current.byPatientId
          : { ...current.byPatientId, [patientId]: EMPTY_CLINIC_VITALS },
        hydratedPatientIds: { ...current.hydratedPatientIds, [patientId]: true },
      }))
      return
    }

    const settle = hydration.begin(patientId)
    const apply = (vitals: ClinicVitals) => {
      // A read that resolves after the chart moved on is a record for a patient
      // nobody is looking at; it is dropped, and the chart it belongs to is
      // read again if it is opened.
      if (!settle()) return
      set((current) => ({
        // A clinician who answered while the read was in flight has said
        // something more recent than storage; their answer stands.
        byPatientId: current.byPatientId[patientId]
          ? current.byPatientId
          : { ...current.byPatientId, [patientId]: vitals },
        hydratedPatientIds: { ...current.hydratedPatientIds, [patientId]: true },
      }))
    }
    void loadEncryptedAnswers<unknown>(clinicVitalsStorageKey(patientId))
      .then((stored) => apply(toClinicVitals(stored)))
      // A record that cannot be read leaves the chart asking, which is the
      // same state as a patient who has never been answered for.
      .catch(() => apply(EMPTY_CLINIC_VITALS))
  },

  setVitals: (patientId, patch, now = new Date()) => {
    if (!patientId) return
    set((state) => {
      const current = state.byPatientId[patientId]
      const next = mergeClinicVitals(current, patch, now)
      // Nothing changed — and where there was nothing in memory to change,
      // `next` is the frozen empty record, which must not be written over a
      // stored one this session has not read back yet.
      if (next === current || next === EMPTY_CLINIC_VITALS) return state
      // In memory first; the encryption runs in the background and cannot
      // reach back into what the screen is already showing.
      writeStoredVitals(patientId, next)
      return { byPatientId: { ...state.byPatientId, [patientId]: next } }
    })
  },

  setCongestionGroup: (patientId, group, value, now = new Date()) => {
    get().setVitals(patientId, congestionGroupPatch(group, value), now)
  },

  clearVitals: (patientId) => {
    if (!patientId) return
    discardEncryptedAnswers(clinicVitalsStorageKey(patientId))
    set((state) => ({
      byPatientId: { ...state.byPatientId, [patientId]: EMPTY_CLINIC_VITALS },
      hydratedPatientIds: { ...state.hydratedPatientIds, [patientId]: true },
    }))
  },
}))

/**
 * One patient's visit record, referentially stable between changes.
 *
 * The profile memo in `LiveFeature` uses this object as a dependency, so a new
 * literal on every render would rebuild the whole adapter on unrelated renders.
 */
export function useClinicVitals(patientId: string | undefined): ClinicVitals | undefined {
  return useClinicVitalsStore((state) => (patientId ? state.byPatientId[patientId] : undefined))
}

/**
 * Whether this chart's record has been read back yet.
 *
 * 「沒有答案」 and 「還沒讀到」 look identical on screen and mean opposite
 * things, so the questions wait for this rather than rendering unanswered and
 * jumping when the decryption lands.
 */
export function useClinicVitalsHydrated(patientId: string | undefined): boolean {
  return useClinicVitalsStore(
    (state) => !patientId || Boolean(state.hydratedPatientIds[patientId]),
  )
}

/** Reads one patient's record outside React (tests, imperative callers). The
 *  stored copy is encrypted, so only what this session has read back is here. */
export function getClinicVitals(patientId: string): ClinicVitals {
  return useClinicVitalsStore.getState().byPatientId[patientId] ?? EMPTY_CLINIC_VITALS
}

/**
 * A record built from one statement, for a caller that has no store — the
 * fixtures in the tests, and any pure reading of 「如果醫師這樣答會怎樣」.
 */
export function buildClinicVitals(
  patch: ClinicVitalsPatch,
  now: Date = new Date(),
): ClinicVitals {
  return mergeClinicVitals(EMPTY_CLINIC_VITALS, patch, now)
}
