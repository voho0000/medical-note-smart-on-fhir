/**
 * Puts what was measured and answered in the room into the profile the pack
 * reads.
 *
 * Each entered value replaces the record's fact for that key and carries its
 * own measurement date, so a freshness window reads it as what it is: a weight
 * taken today is current, a weight carried over from last month is a month
 * old. The wording follows the adapter's own — `142/84 mmHg（2026-09-05）` —
 * with a provenance note inside the parenthesis, because a number nobody can
 * trace to a record must say where it came from wherever it is printed.
 *
 * Nothing here judges. 「未評估」 and 「沒問」 both produce no fact, because the
 * pack must not read either as a negative finding; only 「無」 is a negation,
 * and it travels as a negated term.
 */
import type { CdssFreshnessContext, CdssPatientProfile } from '../types'
import {
  CONGESTION_SIGN_TERMS,
  NOT_ASSESSED,
  type ClinicVitals,
  type ClinicVitalsEntryKey,
  type CongestionSignsAnswer,
} from '../stores/clinic-vitals.store'

export { CONGESTION_SIGN_TERMS }

/**
 * Whether a one-tap group reads as answered 「有」.
 *
 * The group control and the evidence rows are two ways of stating the same
 * examination, so they share one record and one reading: a group is 「有」 when
 * any sign it stands for was answered 「有」, wherever that answer was given.
 */
export function isCongestionGroupPresent(
  vitals: ClinicVitals | undefined,
  group: CongestionSignsAnswer,
): boolean {
  return (CONGESTION_SIGN_TERMS[group] ?? [])
    .some((term) => vitals?.signAnswers?.[term]?.value === 'present')
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

/**
 * The term each compensation judgement is written as.
 *
 * Deliberately not `decompensatedHeartFailure`: that fact is the adapter's, read
 * from an HF admission or emergency visit inside a 90-day window, and the
 * cardiac-rehabilitation safety module raises its priority from it. Writing a
 * clinic judgement into the same key would let 「今天看起來穩定」 erase a real
 * admission, and 「今天失代償」 silently reclassify exercise risk from the host.
 * The judgement travels under its own key; what the pack should make of it is
 * the pack's to decide.
 */
export const COMPENSATION_STATUS_TERMS = {
  compensated: 'compensated',
  decompensated: 'decompensated',
} as const

export const CLINIC_ENTRY_NOTE = { zh: '門診輸入', en: 'entered in clinic' } as const

/** Recognises a fact this file wrote, wherever the pack prints it. */
export const CLINIC_ENTRY_PATTERN = /門診輸入|entered in clinic/

/** The windows the adapter attaches when the record holds the fact. */
const DEFAULT_INTERVAL_DAYS: Readonly<Record<string, number>> = {
  bloodPressure: 90,
  heartRate: 90,
  bodyWeight: 30,
}

function ageInDays(date: string, evaluatedAt: string | undefined): number | undefined {
  const at = Date.parse(date.length === 10 ? `${date}T00:00:00` : date)
  const now = evaluatedAt ? Date.parse(evaluatedAt) : Date.now()
  if (Number.isNaN(at) || Number.isNaN(now)) return undefined
  return Math.max(0, Math.floor((now - at) / 86_400_000))
}

function noteZh(date: string): string {
  return `（${date} ${CLINIC_ENTRY_NOTE.zh}）`
}

function noteEn(date: string): string {
  return ` (${date}, ${CLINIC_ENTRY_NOTE.en})`
}

export function applyClinicVitals(
  profile: CdssPatientProfile,
  vitals: ClinicVitals | undefined,
): CdssPatientProfile {
  if (!vitals) return profile
  const facts: Record<string, CdssPatientProfile['facts'][string]> = {}
  /** The measurement date of each fact this file wrote, for the windows below. */
  const factDates: Record<string, string> = {}
  const entry = (key: ClinicVitalsEntryKey) => vitals.entries?.[key]

  const systolic = entry('systolic')
  const diastolic = entry('diastolic')
  if (systolic && diastolic) {
    // Two numbers, one reading. The later of the two dates is the reading's:
    // a half re-entered today makes the pair today's.
    const date = systolic.measuredOn > diastolic.measuredOn ? systolic.measuredOn : diastolic.measuredOn
    facts.bloodPressure = {
      zh: `${systolic.value}/${diastolic.value} mmHg${noteZh(date)}`,
      en: `${systolic.value}/${diastolic.value} mmHg${noteEn(date)}`,
      unit: 'mmHg',
      date,
    }
    factDates.bloodPressure = date
  }

  const heartRate = entry('heartRate')
  if (heartRate) {
    facts.heartRate = {
      zh: `${heartRate.value} bpm${noteZh(heartRate.measuredOn)}`,
      en: `${heartRate.value} bpm${noteEn(heartRate.measuredOn)}`,
      numericValue: heartRate.value,
      unit: 'bpm',
      date: heartRate.measuredOn,
    }
    factDates.heartRate = heartRate.measuredOn
  }

  const bodyWeight = entry('bodyWeight')
  if (bodyWeight) {
    facts.bodyWeight = {
      zh: `${bodyWeight.value} kg${noteZh(bodyWeight.measuredOn)}`,
      en: `${bodyWeight.value} kg${noteEn(bodyWeight.measuredOn)}`,
      numericValue: bodyWeight.value,
      unit: 'kg',
      date: bodyWeight.measuredOn,
    }
    factDates.bodyWeight = bodyWeight.measuredOn
  }

  const bodyHeight = entry('bodyHeight')
  if (bodyHeight) {
    facts.bodyHeight = {
      zh: `${bodyHeight.value} cm${noteZh(bodyHeight.measuredOn)}`,
      en: `${bodyHeight.value} cm${noteEn(bodyHeight.measuredOn)}`,
      numericValue: bodyHeight.value,
      unit: 'cm',
      date: bodyHeight.measuredOn,
    }
  }

  // The BMI a rule reads is derived, not entered. The adapter derives it from
  // the record's own height and weight before this file runs, so a height or a
  // weight typed in the room would otherwise leave `bodyMassIndex` stating the
  // record's pair — the H2FPEF score's heaviest component read off numbers the
  // clinician has just replaced. Derived here on the adapter's own formula and
  // dated by the weight, which is the half that moves.
  const heightCm = bodyHeight?.value ?? (profile.facts.bodyHeight?.numericValue)
  const weightKg = bodyWeight?.value ?? (profile.facts.bodyWeight?.numericValue)
  if ((bodyHeight || bodyWeight) && heightCm && weightKg && heightCm > 0 && weightKg > 0) {
    const rounded = Math.round((weightKg / ((heightCm / 100) ** 2)) * 10) / 10
    const date = bodyWeight?.measuredOn ?? profile.facts.bodyWeight?.date
    facts.bodyMassIndex = {
      zh: `${rounded} kg/m²（身高 ${heightCm} cm、體重 ${weightKg} kg${date ? `；${date} ${CLINIC_ENTRY_NOTE.zh}` : ''}）`,
      en: `${rounded} kg/m2 (height ${heightCm} cm, weight ${weightKg} kg${date ? `; ${date}, ${CLINIC_ENTRY_NOTE.en}` : ''})`,
      numericValue: rounded,
      unit: 'kg/m²',
      ...(date ? { date } : {}),
    }
  }

  // One fact out, however it was entered. The question row and the evidence
  // table both write `signAnswers`, so a sign stated once is stated everywhere.
  // A sign answered 「無」 becomes a negated term, which is how the pack tells
  // 「看了，沒有」 from 「沒問」; 「未評估」 writes nothing at all.
  const matched = new Set<string>()
  const negated = new Set<string>()
  let signDate: string | undefined
  for (const [term, answer] of Object.entries(vitals.signAnswers ?? {})) {
    if (answer.value === NOT_ASSESSED) continue
    const day = answer.modifiedAt.slice(0, 10)
    if (day && (!signDate || day > signDate)) signDate = day
    if (answer.value === 'present') {
      negated.delete(term)
      matched.add(term)
    } else {
      matched.delete(term)
      negated.add(term)
    }
  }
  if (matched.size > 0 || negated.size > 0) {
    const date = signDate ?? ''
    facts.clinicCongestionExam = {
      zh: `門診理學檢查${date ? noteZh(date) : ''}`,
      en: `Clinic examination${date ? noteEn(date) : ''}`,
      ...(date ? { date } : {}),
      textEvidence: {
        // The reading of the examination as a whole: anything seen makes it
        // support, and only negations make it argue against.
        direction: matched.size > 0 ? 'supports' : 'against',
        matchedTerms: Array.from(matched),
        ...(negated.size > 0 ? { negatedTerms: Array.from(negated) } : {}),
      },
    }
  }

  const nyha = vitals.nyhaClass
  if (nyha && nyha.value !== NOT_ASSESSED) {
    const date = nyha.modifiedAt.slice(0, 10)
    facts.physicianNyhaClass = {
      zh: `NYHA ${nyha.value}${date ? noteZh(date) : ''}`,
      en: `NYHA ${nyha.value}${date ? noteEn(date) : ''}`,
      ...(date ? { date } : {}),
      textEvidence: {
        // A grade is a finding whichever class it is; whether it argues for the
        // symptoms criterion is the pack's reading, not the host's.
        direction: 'supports',
        matchedTerms: [NYHA_CLASS_TERMS[nyha.value]],
      },
    }
  }

  const compensation = vitals.compensationStatus
  if (compensation && compensation.value !== NOT_ASSESSED) {
    const date = compensation.modifiedAt.slice(0, 10)
    const decompensated = compensation.value === 'decompensated'
    facts.physicianCompensationStatus = {
      zh: `${decompensated ? '失代償' : '代償'}${date ? noteZh(date) : ''}`,
      en: `${decompensated ? 'Decompensated' : 'Compensated'}${date ? noteEn(date) : ''}`,
      ...(date ? { date } : {}),
      textEvidence: {
        // A judgement is a finding whichever way it went; the term says which,
        // and whether it argues for any criterion is the pack's reading, not
        // the host's — the same stance the NYHA grade above takes.
        direction: 'supports',
        matchedTerms: [COMPENSATION_STATUS_TERMS[compensation.value]],
      },
    }
  }

  if (Object.keys(facts).length === 0) return profile

  const freshness: Record<string, CdssFreshnessContext> = {}
  for (const [factKey, date] of Object.entries(factDates)) {
    if (!(factKey in DEFAULT_INTERVAL_DAYS)) continue
    const intervalDays = profile.freshnessContexts?.[factKey]?.intervalDays
      ?? DEFAULT_INTERVAL_DAYS[factKey]
    const age = ageInDays(date, profile.evaluatedAt)
    freshness[factKey] = {
      factKey,
      date,
      ...(age === undefined ? {} : { ageDays: age }),
      intervalDays,
      // A measurement carried over from an earlier visit is still the
      // clinician's own number; the state labels its age and never withholds it.
      state: age !== undefined && age > intervalDays ? 'overdue' : 'current',
    }
  }

  return {
    ...profile,
    facts: { ...profile.facts, ...facts },
    freshnessContexts: { ...(profile.freshnessContexts ?? {}), ...freshness },
  }
}
