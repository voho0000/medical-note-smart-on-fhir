/**
 * Every number the physician entered on the heart-failure status line, per
 * patient.
 *
 * Two acts write here and they write to the same place. 「修改今日數值」 — the
 * pencil at the end of the status line — takes every number at once: what was
 * measured in the room (cuff, pulse, scale, rhythm) and any value the record
 * got wrong or has not caught up with, an LVEF read off today's echo, a
 * potassium from a draw the cloud record does not hold yet. The chip strip
 * under the line takes what the physician saw. A blood pressure has one home,
 * because two homes for the same measurement is how a page starts disagreeing
 * with itself.
 *
 * Everything here is handed to the pack as facts (see `applyClinicVitals`), so
 * every module that reads the value recomputes from it — nothing patches a
 * rendered card, and nothing is ever written back to the record.
 *
 * Persisted per patient the way the physician's decisions are — one
 * localStorage key per patient — because a correction made on this chart must
 * survive a reload and must never follow the clinician into the next one.
 */
import { create } from 'zustand'

/**
 * The symptoms and signs the shared strip asks about, once, for the whole page.
 *
 * The list is the one ESC 2026 Table 7 names, plus the two NYHA classes a
 * clinician actually says out loud. A chip is asked once and lands everywhere
 * it matters — the phenotype card's criterion (i), the congestion evidence
 * table, and the follow-up card — because asking the same question in three
 * places is how a page teaches people to stop answering it.
 *
 * Unticked is undetermined, never absent: nothing here ever writes a negative
 * finding, and the pack never reads a blank as 「沒有症狀」.
 */
export type HeartFailureSymptomId =
  | 'dyspnea'
  | 'orthopnea'
  | 'paroxysmal-nocturnal-dyspnea'
  | 'pitting-edema'
  | 'jvp'
  | 'rales'
  | 'nyha-class-ii'
  | 'nyha-class-iii'

/** The rhythm a clinician can state in the room, for the follow-up card. */
export type ClinicRhythm = 'sinus' | 'atrial-fibrillation' | 'other'

/**
 * The values on the status line a physician can enter or correct.
 *
 * They are the pack's own fact keys, so an entered number lands on exactly the
 * fact the modules already read and nothing is mapped, renamed, or judged on
 * the way.
 */
export type ClinicMetricKey =
  | 'LVEF'
  | 'NTproBNP'
  | 'potassium'
  | 'eGFR'
  | 'sodium'
  | 'bloodPressure'
  | 'bodyWeight'
  | 'height'
  | 'heartRate'

export const CLINIC_METRIC_KEYS: readonly ClinicMetricKey[] = [
  'LVEF',
  'NTproBNP',
  'potassium',
  'eGFR',
  'sodium',
  'bloodPressure',
  'bodyWeight',
  // Height is the one value the dialog takes that the status line does not
  // print. It is asked because the BMI the incretin recommendation is written
  // on needs it, and a cloud record that never had a 成人預防保健 upload has
  // no height at all; it is not shown on the line because a number that does
  // not change is not worth a slot on a line read every visit.
  'height',
  'heartRate',
]

export function isClinicMetricKey(key: string): key is ClinicMetricKey {
  return (CLINIC_METRIC_KEYS as readonly string[]).includes(key)
}

/** One value the physician entered, with the day they entered it. */
export interface ClinicEntry {
  /** The number entered. For a blood pressure this is the systolic. */
  value: number
  /** The diastolic — blood pressure only, where both halves are required. */
  diastolic?: number
  /** The day it was entered, as YYYY-MM-DD; never a collection date. */
  enteredAt: string
}

export type ClinicEntryMap = Readonly<Partial<Record<ClinicMetricKey, ClinicEntry>>>

export interface ClinicVitals {
  /**
   * The numbers, keyed by the fact each one becomes. Each carries its own
   * date: a correction made today must not re-date a weight entered last week.
   */
  entries?: ClinicEntryMap
  /** The rhythm seen on the monitor or felt at the wrist this visit. */
  rhythm?: ClinicRhythm
  /** Seen in the room this visit; absent means unanswered, never "none". */
  symptoms?: readonly HeartFailureSymptomId[]
  /**
   * 「過去曾有」 — ESC 2026 §5.2.2 (i) accepts a prior symptom as readily as a
   * current one, and it says nothing about today's volume status, so the two
   * are kept apart rather than merged into one list.
   */
  priorSymptoms?: readonly HeartFailureSymptomId[]
  /** The day the rhythm and the symptoms were observed, as YYYY-MM-DD. */
  measuredOn: string
}

/** One value as the dialog holds it, before the store dates it. */
export interface ClinicEntryValue {
  value: number
  /** Blood pressure only, where both halves are required. */
  diastolic?: number
}

/**
 * What 「修改今日數值」 hands over in one save: every value on the status line,
 * and the rhythm.
 *
 * The dialog holds all eight values at once, so its save owns all eight: a box
 * with a number is entered, and a box the physician left blank — or emptied —
 * puts that value back on the record's own. Nothing outside the dialog is
 * touched, so the chips the strip wrote survive a save made here.
 */
export interface ClinicValueInputs {
  entries: Readonly<Partial<Record<ClinicMetricKey, ClinicEntryValue>>>
  rhythm?: ClinicRhythm
  measuredOn: string
}

/**
 * What the chip strip hands over. A tap on a chip is the save — the strip is
 * answered every visit and has no button of its own to press.
 */
export interface ClinicSymptomInputs {
  symptoms?: readonly HeartFailureSymptomId[]
  priorSymptoms?: readonly HeartFailureSymptomId[]
  measuredOn: string
}

const STORAGE_PREFIX = 'cdss-clinic-vitals:'

export function clinicVitalsStorageKey(patientId: string): string {
  return `${STORAGE_PREFIX}${patientId}`
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function isEntry(value: unknown): value is ClinicEntry {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return isFinitePositive(candidate.value)
    && typeof candidate.enteredAt === 'string'
    && (candidate.diastolic === undefined || isFinitePositive(candidate.diastolic))
}

function readEntries(value: unknown): ClinicEntryMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const entries = Object.entries(value as Record<string, unknown>)
    .filter((entry): entry is [ClinicMetricKey, ClinicEntry] => (
      isClinicMetricKey(entry[0]) && isEntry(entry[1])
    ))
  return Object.fromEntries(entries)
}

function readSymptoms(value: unknown): readonly HeartFailureSymptomId[] | undefined {
  if (!Array.isArray(value)) return undefined
  const ids = value.filter((item): item is HeartFailureSymptomId => typeof item === 'string')
  return ids.length > 0 ? ids : undefined
}

function isEmpty(vitals: ClinicVitals): boolean {
  return Object.keys(vitals.entries ?? {}).length === 0
    && vitals.rhythm === undefined
    && (vitals.symptoms ?? []).length === 0
    && (vitals.priorSymptoms ?? []).length === 0
}

/**
 * Storage is a cache, never a source of clinical truth: a private window throws
 * on write, a quota can be full, and a hand-edited value can be anything. Every
 * path degrades to "nothing entered", which is the reading a first visit gives.
 */
function readStored(patientId: string): ClinicVitals | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    const raw = window.localStorage.getItem(clinicVitalsStorageKey(patientId))
    if (!raw) return undefined
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
    const candidate = parsed as Record<string, unknown>
    if (typeof candidate.measuredOn !== 'string') return undefined
    const rhythm = candidate.rhythm
    const symptoms = readSymptoms(candidate.symptoms)
    const priorSymptoms = readSymptoms(candidate.priorSymptoms)
    const vitals: ClinicVitals = {
      measuredOn: candidate.measuredOn,
      entries: readEntries(candidate.entries),
      ...(rhythm === 'sinus' || rhythm === 'atrial-fibrillation' || rhythm === 'other'
        ? { rhythm }
        : {}),
      ...(symptoms ? { symptoms } : {}),
      ...(priorSymptoms ? { priorSymptoms } : {}),
    }
    return isEmpty(vitals) ? undefined : vitals
  } catch {
    return undefined
  }
}

function writeStored(patientId: string, vitals: ClinicVitals | undefined): void {
  if (typeof window === 'undefined') return
  const key = clinicVitalsStorageKey(patientId)
  try {
    if (!vitals || isEmpty(vitals)) {
      window.localStorage.removeItem(key)
      return
    }
    window.localStorage.setItem(key, JSON.stringify(vitals))
  } catch {
    // A value that cannot be persisted still holds for this session.
  }
}

interface ClinicVitalsState {
  byPatientId: Readonly<Record<string, ClinicVitals>>
  /** Loads one patient's stored values once; a no-op after that. */
  hydrate: (patientId: string) => void
  /** Replaces the whole record — the raw setter, for tests and restores. */
  setVitals: (patientId: string, vitals: ClinicVitals) => void
  /**
   * The dialog's save. It owns every value on the status line and the rhythm,
   * so all of them are replaced together — a box left blank clears the value,
   * which is 「全部撤銷」 when every box is blank. The chips are left alone.
   */
  recordValues: (patientId: string, inputs: ClinicValueInputs) => void
  /** The chip strip's save, made on every tap; the values are left alone. */
  recordSymptoms: (patientId: string, inputs: ClinicSymptomInputs) => void
  /** 「撤銷」 — the record's own value stands again. */
  clearEntry: (patientId: string, key: ClinicMetricKey) => void
  clearVitals: (patientId: string) => void
}

type ByPatient = { byPatientId: Readonly<Record<string, ClinicVitals>> }

function currentVitals(state: ByPatient, patientId: string): ClinicVitals | undefined {
  return state.byPatientId[patientId] ?? readStored(patientId)
}

function commit(state: ByPatient, patientId: string, vitals: ClinicVitals): ByPatient {
  writeStored(patientId, vitals)
  if (isEmpty(vitals)) {
    const next = { ...state.byPatientId }
    delete next[patientId]
    return { byPatientId: next }
  }
  return { byPatientId: { ...state.byPatientId, [patientId]: vitals } }
}

export const useClinicVitalsStore = create<ClinicVitalsState>()((set, get) => ({
  byPatientId: {},

  hydrate: (patientId) => {
    if (!patientId) return
    if (get().byPatientId[patientId]) return
    const stored = readStored(patientId)
    if (!stored) return
    set((state) => (
      state.byPatientId[patientId]
        ? state
        : { byPatientId: { ...state.byPatientId, [patientId]: stored } }
    ))
  },

  setVitals: (patientId, vitals) => {
    if (!patientId) return
    set((state) => commit(state, patientId, vitals))
  },

  recordValues: (patientId, inputs) => {
    if (!patientId) return
    set((state) => {
      const current = currentVitals(state, patientId)
      const entries: Record<string, ClinicEntry> = {}
      for (const key of CLINIC_METRIC_KEYS) {
        const draft = inputs.entries[key]
        if (!draft || !isFinitePositive(draft.value)) continue
        if (key === 'bloodPressure' && !isFinitePositive(draft.diastolic)) continue
        // A save that re-states a value must not re-date it: the dialog opens
        // with every entered value already in its box, so an untouched weight
        // would otherwise claim to have been measured again today.
        const previous = current?.entries?.[key]
        const unchanged = previous !== undefined
          && previous.value === draft.value
          && previous.diastolic === draft.diastolic
        entries[key] = {
          value: draft.value,
          ...(draft.diastolic !== undefined ? { diastolic: draft.diastolic } : {}),
          enteredAt: unchanged ? previous.enteredAt : inputs.measuredOn,
        }
      }
      const symptoms = current?.symptoms ?? []
      const priorSymptoms = current?.priorSymptoms ?? []
      return commit(state, patientId, {
        entries,
        ...(inputs.rhythm ? { rhythm: inputs.rhythm } : {}),
        ...(symptoms.length > 0 ? { symptoms: [...symptoms] } : {}),
        ...(priorSymptoms.length > 0 ? { priorSymptoms: [...priorSymptoms] } : {}),
        measuredOn: inputs.measuredOn,
      })
    })
  },

  recordSymptoms: (patientId, inputs) => {
    if (!patientId) return
    set((state) => {
      const current = currentVitals(state, patientId)
      const symptoms = inputs.symptoms ?? []
      const priorSymptoms = inputs.priorSymptoms ?? []
      return commit(state, patientId, {
        entries: current?.entries ?? {},
        ...(current?.rhythm ? { rhythm: current.rhythm } : {}),
        ...(symptoms.length > 0 ? { symptoms: [...symptoms] } : {}),
        ...(priorSymptoms.length > 0 ? { priorSymptoms: [...priorSymptoms] } : {}),
        measuredOn: inputs.measuredOn,
      })
    })
  },

  clearEntry: (patientId, key) => {
    if (!patientId) return
    set((state) => {
      const current = currentVitals(state, patientId)
      if (!current?.entries || !(key in current.entries)) return state
      const entries = { ...current.entries }
      delete entries[key]
      return commit(state, patientId, { ...current, entries })
    })
  },

  clearVitals: (patientId) => {
    if (!patientId) return
    writeStored(patientId, undefined)
    set((state) => {
      if (!(patientId in state.byPatientId)) return state
      const next = { ...state.byPatientId }
      delete next[patientId]
      return { byPatientId: next }
    })
  },
}))

export function useClinicVitals(patientId: string | undefined): ClinicVitals | undefined {
  return useClinicVitalsStore((state) => (patientId ? state.byPatientId[patientId] : undefined))
}

/** Reads one patient's entered values outside React (tests, imperative callers). */
export function getClinicVitals(patientId: string): ClinicVitals | undefined {
  return useClinicVitalsStore.getState().byPatientId[patientId] ?? readStored(patientId)
}

/** Today's date in the browser's local calendar, as YYYY-MM-DD. */
export function todayIsoDate(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}
