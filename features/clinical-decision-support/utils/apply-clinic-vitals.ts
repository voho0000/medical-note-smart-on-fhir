/**
 * Puts the vitals measured in the room into the profile the pack reads.
 *
 * Each entered value replaces the record's fact for that key and is dated
 * today, so freshness windows read it as current. The wording follows the
 * adapter's own — `142/84 mmHg（2026-09-05）` — with a provenance note inside
 * the parenthesis, because a number nobody can trace to a record must say
 * where it came from wherever it is printed.
 */
import type { CdssFreshnessContext, CdssPatientProfile } from '../types'
import type { ClinicVitals } from '../stores/clinic-vitals.store'

export const CLINIC_ENTRY_NOTE = { zh: '門診輸入', en: 'entered in clinic' } as const

/** Recognises a fact this file wrote, wherever the pack prints it. */
export const CLINIC_ENTRY_PATTERN = /門診輸入|entered in clinic/

/** The windows the adapter attaches when the record holds the fact. */
const DEFAULT_INTERVAL_DAYS: Readonly<Record<'bloodPressure' | 'heartRate' | 'bodyWeight', number>> = {
  bloodPressure: 90,
  heartRate: 90,
  bodyWeight: 30,
}

function isFinitePositive(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

export function applyClinicVitals(
  profile: CdssPatientProfile,
  vitals: ClinicVitals | undefined,
): CdssPatientProfile {
  if (!vitals) return profile
  const date = vitals.measuredOn
  const noteZh = `（${date} ${CLINIC_ENTRY_NOTE.zh}）`
  const noteEn = ` (${date}, ${CLINIC_ENTRY_NOTE.en})`
  const facts: Record<string, CdssPatientProfile['facts'][string]> = {}

  if (isFinitePositive(vitals.systolic) && isFinitePositive(vitals.diastolic)) {
    facts.bloodPressure = {
      zh: `${vitals.systolic}/${vitals.diastolic} mmHg${noteZh}`,
      en: `${vitals.systolic}/${vitals.diastolic} mmHg${noteEn}`,
      unit: 'mmHg',
      date,
    }
  }
  if (isFinitePositive(vitals.heartRate)) {
    facts.heartRate = {
      zh: `${vitals.heartRate} bpm${noteZh}`,
      en: `${vitals.heartRate} bpm${noteEn}`,
      numericValue: vitals.heartRate,
      unit: 'bpm',
      date,
    }
  }
  if (isFinitePositive(vitals.bodyWeight)) {
    facts.bodyWeight = {
      zh: `${vitals.bodyWeight} kg${noteZh}`,
      en: `${vitals.bodyWeight} kg${noteEn}`,
      numericValue: vitals.bodyWeight,
      unit: 'kg',
      date,
    }
  }
  const factKeys = Object.keys(facts) as (keyof typeof DEFAULT_INTERVAL_DAYS)[]
  if (factKeys.length === 0) return profile

  const freshness: Record<string, CdssFreshnessContext> = {}
  for (const factKey of factKeys) {
    freshness[factKey] = {
      factKey,
      date,
      ageDays: 0,
      intervalDays: profile.freshnessContexts?.[factKey]?.intervalDays ?? DEFAULT_INTERVAL_DAYS[factKey],
      state: 'current',
    }
  }

  return {
    ...profile,
    facts: { ...profile.facts, ...facts },
    freshnessContexts: { ...(profile.freshnessContexts ?? {}), ...freshness },
  }
}
