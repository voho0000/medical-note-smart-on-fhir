/**
 * Puts what the physician entered in the room into the profile the pack reads.
 *
 * Each entered value replaces the record's fact for that key and carries the
 * day it was entered, so freshness windows read it as current. The wording
 * follows the adapter's own — `142/84 mmHg（2026-09-05）` — with a provenance
 * note inside the parenthesis, because a number nobody can trace to a record
 * must say where it came from wherever it is printed.
 *
 * Nothing here is written back to the chart or to the imported bundle: an
 * entered value is host-side physician input, exactly like a decision or a
 * ticked symptom.
 */
import type {
  CdssFact,
  CdssFactSource,
  CdssFreshnessContext,
  CdssLocale,
  CdssPatientProfile,
} from '../types'
import {
  type ClinicEntry,
  type ClinicMetricKey,
  type ClinicRhythm,
  type ClinicVitals,
  type HeartFailureSymptomId,
  CLINIC_METRIC_KEYS,
} from '../stores/clinic-vitals.store'

/**
 * The symptom ids are the pack's own term ids, so a tick lands directly on the
 * evidence rows the pack already reads and nothing is judged here. The one
 * mapping this file owns is which fact each tick belongs in: what the
 * physician saw today, and what the patient reports having had before.
 */
export type { HeartFailureSymptomId }

/** The rhythm term the pack's ECG rows read, per chip. */
const RHYTHM_TERMS: Readonly<Record<ClinicRhythm, readonly string[]>> = {
  sinus: [],
  'atrial-fibrillation': ['atrial-fibrillation-or-flutter'],
  other: [],
}

const RHYTHM_LABEL: Readonly<Record<ClinicRhythm, { zh: string; en: string }>> = {
  sinus: { zh: '竇性心律', en: 'Sinus rhythm' },
  'atrial-fibrillation': { zh: '心房顫動／撲動', en: 'Atrial fibrillation or flutter' },
  other: { zh: '其他心律', en: 'Other rhythm' },
}

export const CLINIC_ENTRY_NOTE = { zh: '門診輸入', en: 'entered in clinic' } as const

/** Recognises a fact this file wrote, wherever the pack prints it. */
export const CLINIC_ENTRY_PATTERN = /門診輸入|entered in clinic/

/**
 * How each entered value is written as a fact.
 *
 * The unit and the shape are the adapter's for that key, so an entered value
 * and a recorded one print identically apart from the provenance note — a
 * clinician comparing the two is comparing numbers, not formats.
 */
interface MetricFactSpec {
  unit: string
  /** For the number input beside the value on the status line. */
  step: string
  /** The value as the adapter writes it, before the date parenthesis. */
  text: (entry: ClinicEntry) => string
  /** Absent where the adapter's own fact carries no number — a blood pressure. */
  numeric?: (entry: ClinicEntry) => number
}

const METRIC_FACTS: Readonly<Record<ClinicMetricKey, MetricFactSpec>> = {
  LVEF: { unit: '%', step: '0.1', text: (entry) => `${entry.value}%`, numeric: (entry) => entry.value },
  NTproBNP: { unit: 'pg/mL', step: '1', text: (entry) => `${entry.value} pg/mL`, numeric: (entry) => entry.value },
  potassium: { unit: 'mmol/L', step: '0.1', text: (entry) => `${entry.value} mmol/L`, numeric: (entry) => entry.value },
  eGFR: { unit: 'mL/min/1.73m²', step: '1', text: (entry) => `${entry.value} mL/min/1.73m²`, numeric: (entry) => entry.value },
  sodium: { unit: 'mmol/L', step: '1', text: (entry) => `${entry.value} mmol/L`, numeric: (entry) => entry.value },
  bloodPressure: { unit: 'mmHg', step: '1', text: (entry) => `${entry.value}/${entry.diastolic} mmHg` },
  bodyWeight: { unit: 'kg', step: '0.1', text: (entry) => `${entry.value} kg`, numeric: (entry) => entry.value },
  // Centimetres, the unit the adapter writes a height in whichever unit the
  // record stated it in, so an entered height and a recorded one are the same
  // number in the same unit and the pack's BMI cannot depend on which it got.
  height: { unit: 'cm', step: '0.1', text: (entry) => `${entry.value} cm`, numeric: (entry) => entry.value },
  heartRate: { unit: 'bpm', step: '1', text: (entry) => `${entry.value} bpm`, numeric: (entry) => entry.value },
}

/** The unit each editable value is entered in, for the inline editor. */
export const CLINIC_METRIC_UNIT: Readonly<Record<ClinicMetricKey, string>> = Object.fromEntries(
  CLINIC_METRIC_KEYS.map((key) => [key, METRIC_FACTS[key].unit]),
) as Readonly<Record<ClinicMetricKey, string>>

/** The input step each editable value takes, for the inline editor. */
export const CLINIC_METRIC_STEP: Readonly<Record<ClinicMetricKey, string>> = Object.fromEntries(
  CLINIC_METRIC_KEYS.map((key) => [key, METRIC_FACTS[key].step]),
) as Readonly<Record<ClinicMetricKey, string>>

/** The windows the adapter attaches when the record holds the fact. */
const DEFAULT_INTERVAL_DAYS: Readonly<Record<string, number>> = {
  bloodPressure: 90,
  heartRate: 90,
  bodyWeight: 30,
  ecgRhythm: 180,
  potassium: 90,
  sodium: 90,
  eGFR: 90,
  NTproBNP: 180,
}

function isFinitePositive(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

/** A blood pressure is two numbers or none; everything else is one. */
function isUsable(key: ClinicMetricKey, entry: ClinicEntry | undefined): entry is ClinicEntry {
  if (!entry || !isFinitePositive(entry.value)) return false
  return key !== 'bloodPressure' || isFinitePositive(entry.diastolic)
}

function factFor(key: ClinicMetricKey, entry: ClinicEntry): CdssFact {
  const spec = METRIC_FACTS[key]
  const date = entry.enteredAt
  const numeric = spec.numeric?.(entry)
  return {
    zh: `${spec.text(entry)}（${date} ${CLINIC_ENTRY_NOTE.zh}）`,
    en: `${spec.text(entry)} (${date}, ${CLINIC_ENTRY_NOTE.en})`,
    ...(numeric !== undefined ? { numericValue: numeric } : {}),
    unit: spec.unit,
    date,
  }
}

/**
 * The entered ejection fraction as the last point of the trajectory.
 *
 * ESC 2026 §5.2.2 (ii) reads the trend for a prior reduced value, so a
 * correction that replaced only `LVEF` would leave the two disagreeing: the
 * line would say 35% while the trajectory the improvement rule reads still
 * ended at the record's 63%. The record's earlier points stay exactly as they
 * are and the entered reading is appended after them, so a prior study below
 * 50% is still seen. The source id is prefixed `clinic-entry:` so nothing
 * mistakes it for a record the left panel could open.
 */
function lvefTrendWith(profile: CdssPatientProfile, entry: ClinicEntry): CdssFact | undefined {
  const recorded = profile.facts.LVEFTrend?.sources ?? profile.facts.LVEF?.sources ?? []
  const entered: CdssFactSource = {
    resourceType: 'Observation',
    resourceId: `clinic-entry:LVEF:${entry.enteredAt}`,
    date: entry.enteredAt,
    value: entry.value,
    unit: '%',
  }
  const sources = [...recorded, entered]
  if (sources.length < 2) return undefined
  const trend = sources.map((source) => `${source.date} ${source.value}%`).join(' → ')
  return {
    zh: `${trend}（${entry.enteredAt} ${CLINIC_ENTRY_NOTE.zh}）`,
    en: `${trend} (${entry.enteredAt}, ${CLINIC_ENTRY_NOTE.en})`,
    numericValue: entry.value,
    unit: '%',
    date: entry.enteredAt,
    sources,
  }
}

export function applyClinicVitals(
  profile: CdssPatientProfile,
  vitals: ClinicVitals | undefined,
): CdssPatientProfile {
  if (!vitals) return profile
  const date = vitals.measuredOn
  const facts: Record<string, CdssFact> = {}
  /** Which fact keys carry an entered date, for the freshness pass. */
  const dates: Record<string, string> = {}

  for (const key of CLINIC_METRIC_KEYS) {
    const entry = vitals.entries?.[key]
    if (!isUsable(key, entry)) continue
    facts[key] = factFor(key, entry)
    dates[key] = entry.enteredAt
    if (key === 'LVEF') {
      const trend = lvefTrendWith(profile, entry)
      if (trend) facts.LVEFTrend = trend
    }
  }

  if (vitals.rhythm) {
    const label = RHYTHM_LABEL[vitals.rhythm]
    facts.ecgRhythm = {
      zh: `${label.zh}（${date} ${CLINIC_ENTRY_NOTE.zh}）`,
      en: `${label.en} (${date}, ${CLINIC_ENTRY_NOTE.en})`,
      date,
      textEvidence: {
        direction: RHYTHM_TERMS[vitals.rhythm].length > 0 ? 'supports' : 'against',
        matchedTerms: RHYTHM_TERMS[vitals.rhythm],
      },
    }
    dates.ecgRhythm = date
  }

  // The symptom ids are already the pack's term ids, so they pass through
  // unmapped. Only a ticked chip is written: an untouched strip leaves both
  // facts absent, which the pack reads as undetermined rather than as absent
  // symptoms.
  const symptoms = vitals.symptoms ?? []
  if (symptoms.length > 0) {
    facts.clinicCongestionExam = {
      zh: `門診理學檢查（${date} ${CLINIC_ENTRY_NOTE.zh}）`,
      en: `Clinic examination (${date}, ${CLINIC_ENTRY_NOTE.en})`,
      date,
      textEvidence: {
        direction: 'supports',
        matchedTerms: Array.from(new Set<string>(symptoms)),
      },
    }
  }
  const priorSymptoms = vitals.priorSymptoms ?? []
  if (priorSymptoms.length > 0) {
    facts.clinicPriorHfSymptoms = {
      zh: `過去曾有的心衰竭症狀／徵象（${date} ${CLINIC_ENTRY_NOTE.zh}）`,
      en: `Prior heart-failure symptoms or signs (${date}, ${CLINIC_ENTRY_NOTE.en})`,
      date,
      textEvidence: {
        direction: 'supports',
        matchedTerms: Array.from(new Set<string>(priorSymptoms)),
      },
    }
  }

  if (Object.keys(facts).length === 0) return profile

  const freshness: Record<string, CdssFreshnessContext> = {}
  for (const [factKey, factDate] of Object.entries(dates)) {
    const intervalDays = profile.freshnessContexts?.[factKey]?.intervalDays
      ?? DEFAULT_INTERVAL_DAYS[factKey]
    // A key the adapter attaches no window to gets none invented here.
    if (intervalDays === undefined) continue
    freshness[factKey] = {
      factKey,
      date: factDate,
      ageDays: 0,
      intervalDays,
      state: 'current',
    }
  }

  return {
    ...profile,
    facts: { ...profile.facts, ...facts },
    freshnessContexts: { ...(profile.freshnessContexts ?? {}), ...freshness },
  }
}

/**
 * What one entered value replaced, so the status line can say so.
 *
 * The board reads this rather than matching the provenance note in the printed
 * string: a value is 「門診輸入」 because the physician entered it, and the tag,
 * the undo and the 「紀錄：…」 tooltip are all read from that fact rather than
 * from wording that changes with the locale.
 */
export interface ClinicEntryContext {
  factKey: ClinicMetricKey
  /** The day the physician entered it, as YYYY-MM-DD. */
  enteredAt: string
  /** The record's own value for this key, as the adapter wrote it. */
  recordValue?: string
  recordDate?: string
}

export type ClinicEntryContextMap = Readonly<Partial<Record<ClinicMetricKey, ClinicEntryContext>>>

const NO_ENTRY_CONTEXTS: ClinicEntryContextMap = Object.freeze({})

/**
 * Reads the contexts off the **record** profile — the one before
 * `applyClinicVitals` overwrote anything — because the value an entry replaced
 * only exists there.
 */
export function clinicEntryContexts(
  recordProfile: CdssPatientProfile | null | undefined,
  vitals: ClinicVitals | undefined,
  locale: CdssLocale,
): ClinicEntryContextMap {
  if (!vitals?.entries) return NO_ENTRY_CONTEXTS
  const contexts: Partial<Record<ClinicMetricKey, ClinicEntryContext>> = {}
  for (const key of CLINIC_METRIC_KEYS) {
    const entry = vitals.entries[key]
    if (!isUsable(key, entry)) continue
    const fact = recordProfile?.facts?.[key]
    const recordValue = fact ? (locale === 'en' ? fact.en : fact.zh) : undefined
    contexts[key] = {
      factKey: key,
      enteredAt: entry.enteredAt,
      ...(recordValue?.trim() ? { recordValue } : {}),
      ...(fact?.date ? { recordDate: fact.date } : {}),
    }
  }
  return Object.keys(contexts).length > 0 ? contexts : NO_ENTRY_CONTEXTS
}
