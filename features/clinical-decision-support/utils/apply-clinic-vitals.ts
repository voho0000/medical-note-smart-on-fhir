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
import type { ClinicVitals, CongestionSignsAnswer } from '../stores/clinic-vitals.store'

/**
 * The evidence-table terms each one-tap answer stands for. These are the
 * congestion table's own term ids (`congestion:<term>` rows), so a tap lands
 * on the rows the pack already reads; nothing is judged here.
 */
export const CONGESTION_SIGN_TERMS: Readonly<Record<CongestionSignsAnswer, readonly string[]>> = {
  edema: ['pitting-edema'],
  'orthopnea-pnd': ['orthopnea', 'paroxysmal-nocturnal-dyspnea'],
  'jvp-rales': ['jvp', 'rales'],
}

/** One answer per sign, keyed by the term the evidence rows are matched on. */
export type SignAnswers = Readonly<Record<string, 'present' | 'absent'>>

/**
 * Whether a one-tap group reads as answered 「有」.
 *
 * The group chips and the evidence rows are two ways of stating the same
 * examination, so they share one store and one reading: a chip is lit when any
 * sign it stands for has been answered 「有」, wherever that answer was given.
 * Without this the clinician ticks 「Orthopnea：有」 on the row below and the
 * chip above still says 「預設未回答」 about the same patient.
 */
export function isCongestionGroupPresent(
  answers: SignAnswers | undefined,
  group: CongestionSignsAnswer,
): boolean {
  return (CONGESTION_SIGN_TERMS[group] ?? []).some((term) => answers?.[term] === 'present')
}

/**
 * The answers after tapping one group on or off.
 *
 * Tapping on says 「有」 for every sign in the group; tapping off returns them
 * to 未評估 rather than asserting 「無」, because a chip nobody tapped and a
 * chip someone untapped both mean the same thing — it was not stated. Saying
 * 「無」 stays with the row control, where it is one sign at a time.
 */
export function toggleCongestionGroup(
  answers: SignAnswers | undefined,
  group: CongestionSignsAnswer,
  present: boolean,
): SignAnswers | undefined {
  const next: Record<string, 'present' | 'absent'> = { ...(answers ?? {}) }
  for (const term of CONGESTION_SIGN_TERMS[group] ?? []) {
    if (present) next[term] = 'present'
    else delete next[term]
  }
  return Object.keys(next).length > 0 ? next : undefined
}

/**
 * The evidence-table rows a clinician can answer in the room, and the term
 * each one is matched on.
 *
 * Named here rather than read off the row, because an `EvidenceItem` carries
 * its matched terms only once something matched — a row nobody has answered
 * has none, which is exactly the row that needs the control. The ids and terms
 * are the published congestion table's own; a row missing from this map
 * (bendopnea, hepatojugular reflux, NYHA class) is one that table gives no
 * term to, so an answer would have nowhere to land and the row keeps the plain
 * include-or-exclude switch.
 */
export const EVIDENCE_ROW_SIGN_TERMS: Readonly<Record<string, string>> = {
  'congestion:orthopnea': 'orthopnea',
  'congestion:pnd': 'paroxysmal-nocturnal-dyspnea',
  'congestion:jvp': 'jvp',
  'congestion:s3': 'third-heart-sound',
  'congestion:rales': 'rales',
  'congestion:pitting-edema': 'pitting-edema',
  'congestion:ascites': 'ascites',
  'congestion:hepatomegaly': 'hepatomegaly',
  // Termless in the published table; the pack completes them on the way out,
  // so an answer here does reach the reading.
  'congestion:bendopnea': 'bendopnea',
  'congestion:hepatojugular-reflux': 'hepatojugular-reflux',
  // The LV filling-pressure table asks two of the same signs under its own ids.
  'filling-pressure:orthopnea': 'orthopnea',
  'filling-pressure:jvp': 'jvp',
}

/** The term each NYHA class is written as, matching the pack's own map. */
export const NYHA_CLASS_TERMS = {
  I: 'nyha-i',
  II: 'nyha-ii',
  III: 'nyha-iii',
  IV: 'nyha-iv',
} as const

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
  // One fact out, however it was entered. The board's three-group chips and the
  // evidence table's rows both write `signAnswers`, so a sign stated once is
  // stated everywhere. A sign answered 「無」 becomes a negated term, which is
  // how the pack tells 「看了，沒有」 from 「沒問」.
  const matched = new Set<string>()
  const negated = new Set<string>()
  for (const [term, answer] of Object.entries(vitals.signAnswers ?? {})) {
    if (answer === 'present') {
      negated.delete(term)
      matched.add(term)
    } else {
      matched.delete(term)
      negated.add(term)
    }
  }
  if (matched.size > 0 || negated.size > 0) {
    facts.clinicCongestionExam = {
      zh: `門診理學檢查（${date} ${CLINIC_ENTRY_NOTE.zh}）`,
      en: `Clinic examination (${date}, ${CLINIC_ENTRY_NOTE.en})`,
      date,
      textEvidence: {
        // The reading of the examination as a whole: anything seen makes it
        // support, and only negations make it argue against.
        direction: matched.size > 0 ? 'supports' : 'against',
        matchedTerms: Array.from(matched),
        ...(negated.size > 0 ? { negatedTerms: Array.from(negated) } : {}),
      },
    }
  }

  if (vitals.nyhaClass) {
    facts.physicianNyhaClass = {
      zh: `NYHA ${vitals.nyhaClass}（${date} ${CLINIC_ENTRY_NOTE.zh}）`,
      en: `NYHA ${vitals.nyhaClass} (${date}, ${CLINIC_ENTRY_NOTE.en})`,
      date,
      textEvidence: {
        // A grade is a finding whichever class it is; whether it argues for the
        // symptoms criterion is the pack's reading, not the host's.
        direction: 'supports',
        matchedTerms: [NYHA_CLASS_TERMS[vitals.nyhaClass]],
      },
    }
  }

  const factKeys = Object.keys(facts).filter(
    (key): key is keyof typeof DEFAULT_INTERVAL_DAYS => key in DEFAULT_INTERVAL_DAYS,
  )
  if (Object.keys(facts).length === 0) return profile

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
