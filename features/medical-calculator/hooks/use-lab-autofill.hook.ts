// useLabAutofill — resolves calculator input sources against the current
// patient's most-recent observations + demographics.
//
// Lab analytes resolve through the shared canonical layer (getAnalyteCanonicalKey),
// the same one the cumulative report uses, so cross-institution name/LOINC
// variants collapse correctly. Weight/height/blood-pressure are vital signs that
// live outside the canonical lab map, so they're matched by LOINC directly.
// Blood pressure arrives as a panel (LOINC 85354-9) whose systolic/diastolic
// values live in `component[]`, so components are indexed too.

import { useMemo } from 'react'
import { useClinicalData } from '@/src/application/hooks/clinical-data/use-clinical-data-query.hook'
import { usePatient } from '@/src/application/hooks/patient/use-patient-query.hook'
import { getAnalyteCanonicalKey, canonicalKeyFromLoinc } from '@/src/shared/utils/lab-normalize'
import type { AutofillSource, VitalKind } from '../types'

export interface AutofillValue {
  value: number
  unit: string
  /** effectiveDateTime of the source observation (ISO), for the "from <date>" hint. */
  date: string
  /** True when the analyte identity came from a LOINC code (trusted); false when
   *  it was matched only by display name/text (fuzzier — the unit-dimension
   *  safety gate in resolveInput applies). Absent = trusted (LOINC/vital/demo). */
  viaLoinc?: boolean
  /** Source-report provenance (for the "來源" line + jump-to-report). */
  testName?: string // the source report's test name (code.text / coding display)
  loinc?: string // the LOINC code that identified it (if any)
  facility?: string // performing lab / institution (performer[0].display)
  obsId?: string // FHIR Observation.id, for navigating to the source report
}

export interface Autofill {
  resolve: (source?: AutofillSource) => AutofillValue | undefined
  sex?: string
}

/** Minimal shape of an observation (or one of its components) we read. */
interface CodeHolder {
  code?: { text?: string; coding?: Array<{ code?: string; display?: string; system?: string }> }
  valueQuantity?: { value?: number; unit?: string }
}
interface ObsLike extends CodeHolder {
  id?: string
  effectiveDateTime?: string
  specimen?: { display?: string }
  performer?: Array<{ display?: string }>
  component?: CodeHolder[]
}

/** Source-report provenance carried by an obs down to its components. */
interface ObsMeta { obsId?: string; facility?: string }

/** Pull the display name + LOINC code off a code holder (obs or component). */
function readCodeProvenance(holder: CodeHolder): { testName?: string; loinc?: string } {
  const codings = holder.code?.coding ?? []
  const loinc = codings.find((c) => /loinc/i.test(c.system ?? ''))?.code ?? codings.find((c) => c?.code)?.code
  const testName = holder.code?.text || codings.find((c) => c.display)?.display || undefined
  return { testName, loinc }
}

/** Keep the latest (by effectiveDateTime) of two candidates. */
function keepLatest(cur: AutofillValue | undefined, next: AutofillValue): AutofillValue {
  if (!cur) return next
  return next.date > cur.date ? next : cur
}

/** Classify an Observation.specimen.display into blood vs urine (or undefined). */
function normSpecimen(display: string | undefined): 'blood' | 'urine' | 'other' | undefined {
  if (!display) return undefined
  const d = display.toLowerCase()
  if (/urin/.test(d)) return 'urine'
  if (/blood|serum|plas/.test(d)) return 'blood'
  return 'other'
}

/** Urine albumin concentration → mg/L (the numerator unit for ACR mg/g). */
function albuminToMgL(value: number, unit: string): number | undefined {
  switch (unit.toLowerCase().replace('µ', 'u')) {
    case 'mg/l': return value
    case 'mg/dl': return value * 10
    case 'g/l': return value * 1000
    case 'ug/ml': case 'mcg/ml': return value // µg/mL ≡ mg/L
    default: return undefined
  }
}
/** Urine creatinine concentration → g/L (the denominator unit for ACR mg/g). */
function urineCreatinineToGL(value: number, unit: string): number | undefined {
  switch (unit.toLowerCase().replace('µ', 'u')) {
    case 'mg/dl': return value * 0.01
    case 'mg/l': return value * 0.001
    case 'g/l': return value
    case 'mmol/l': return value * 0.11312 // creatinine MW 113.12 g/mol
    case 'umol/l': return value * 0.00011312
    default: return undefined
  }
}

/** Classify a vital by display name/text ONLY — a fallback for FHIR that omits
 *  the vital's LOINC (LOINC-matched vitals already resolve via byLoinc). */
function classifyVitalByName(holder: CodeHolder): VitalKind | undefined {
  const text = (holder.code?.text || holder.code?.coding?.[0]?.display || '').toLowerCase()
  if (!text) return undefined
  if (/systolic|收縮壓/.test(text)) return 'sbp'
  if (/body\s*weight|體重|^weight$/.test(text)) return 'weight'
  if (/body\s*height|身高|^height$/.test(text)) return 'height'
  return undefined
}
/** Unit-dimension safety gate for a NAME-matched vital: only accept a value
 *  whose unit fits the vital, so a mislabelled row can't be mis-filled. */
function unitOkForVital(kind: VitalKind, unit: string): boolean {
  const u = unit.toLowerCase().replace(/[\s[\]]/g, '')
  if (kind === 'weight') return /^(kg|g|lb|lbs)$/.test(u)
  if (kind === 'height') return /^(cm|m|in|inch|")$/.test(u)
  return /^mmhg$/.test(u) // sbp
}

/**
 * Pure autofill-index builder — indexes each observation (and, for panels like
 * blood pressure, each `component`) by canonical analyte key, by LOINC code, and
 * by specimen+key. Exported so the resolution logic can be unit-tested without
 * React context. `useLabAutofill` is the thin hook wrapper.
 */
export function buildAutofill(
  observations: ObsLike[],
  demographics: { age?: number; gender?: string },
): Autofill {
  const byCanonical: Record<string, AutofillValue> = {}
  const byLoinc: Record<string, AutofillValue> = {}
  // Keyed by `${specimen}|${canonicalKey}` (e.g. "blood|NA", "urine|CREA").
  const bySpecimen: Record<string, AutofillValue> = {}
  // Vitals matched by display name (fallback when LOINC is absent).
  const byVital: Partial<Record<VitalKind, AutofillValue>> = {}
  // Components for deriving urine ACR when it isn't reported as a plain number.
  const microAlb: AutofillValue[] = [] // urine microalbumin (14957-5 / MALB)
  const urineCrea: AutofillValue[] = [] // urine creatinine (2161-8 / CREA+urine)

  const index = (holder: CodeHolder, specimenDisplay: string | undefined, date: string, meta: ObsMeta) => {
    const value = holder.valueQuantity?.value
    if (typeof value !== 'number' || !Number.isFinite(value)) return
    // Provenance: was the analyte identity established by a LOINC code (trusted)
    // or only by display name (fuzzier)? Drives the resolveInput safety gate.
    const viaLoinc = canonicalKeyFromLoinc(holder) != null
    const { testName, loinc } = readCodeProvenance(holder)
    const entry: AutofillValue = { value, unit: holder.valueQuantity?.unit ?? '', date, viaLoinc, testName, loinc, obsId: meta.obsId, facility: meta.facility }
    const key = getAnalyteCanonicalKey(holder)
    if (key) byCanonical[key] = keepLatest(byCanonical[key], entry)
    const spec = normSpecimen(specimenDisplay)
    if (key && spec) {
      const sk = `${spec}|${key}`
      bySpecimen[sk] = keepLatest(bySpecimen[sk], entry)
    }
    for (const c of holder.code?.coding ?? []) {
      if (c?.code) byLoinc[c.code] = keepLatest(byLoinc[c.code], entry)
    }
    // Vital display-name fallback (only accept when the unit fits the vital).
    const vk = classifyVitalByName(holder)
    if (vk && unitOkForVital(vk, entry.unit)) byVital[vk] = keepLatest(byVital[vk], entry)
  }

  for (const obs of observations) {
    const date = obs.effectiveDateTime ?? ''
    const meta: ObsMeta = { obsId: obs.id, facility: obs.performer?.find((p) => p?.display)?.display }
    index(obs, obs.specimen?.display, date, meta)
    // Panel components (e.g. BP systolic 8480-6 / diastolic 8462-4) carry their
    // value in component[].valueQuantity, not the top-level obs.
    for (const comp of obs.component ?? []) index(comp, obs.specimen?.display, date, meta)

    // Collect the two components an ACR can be derived from (see below).
    const v = obs.valueQuantity?.value
    if (typeof v === 'number' && Number.isFinite(v)) {
      const entry: AutofillValue = { value: v, unit: obs.valueQuantity?.unit ?? '', date }
      const codes = (obs.code?.coding ?? []).map((c) => c?.code)
      const key = getAnalyteCanonicalKey(obs)
      const spec = normSpecimen(obs.specimen?.display)
      if (codes.includes('14957-5') || key === 'MALB') microAlb.push(entry)
      // Urine creatinine only — never serum (2161-8 is urine-specific; canonical
      // CREA is only accepted when the specimen is explicitly urine).
      if (codes.includes('2161-8') || (key === 'CREA' && spec === 'urine')) urineCrea.push(entry)
    }
  }

  // Derive urine ACR (mg/g) = urine albumin (mg/L) / urine creatinine (g/L) when
  // no ACR is reported as a plain number (Taiwan labs often report a semi-
  // quantitative ACR as text, e.g. "1+ (80)", with the numeric albumin +
  // creatinine reported separately). Only pair a microalbumin and a creatinine
  // from the SAME DAY, and use the most recent such pair.
  const hasDirectAcr = !!(bySpecimen['urine|ACR'] || byCanonical['ACR'] || byLoinc['9318-7'] || byLoinc['14959-1'])
  if (!hasDirectAcr && microAlb.length && urineCrea.length) {
    let best: AutofillValue | undefined
    for (const a of microAlb) {
      const albMgL = albuminToMgL(a.value, a.unit)
      const day = a.date.slice(0, 10)
      if (albMgL === undefined || !day) continue
      for (const c of urineCrea) {
        if (c.date.slice(0, 10) !== day) continue // same-day pairing only
        const creGL = urineCreatinineToGL(c.value, c.unit)
        if (creGL === undefined || creGL <= 0) continue
        const acr = Math.round((albMgL / creGL) * 10) / 10
        const cand: AutofillValue = { value: acr, unit: 'mg/g', date: a.date, viaLoinc: true }
        if (!best || cand.date > best.date) best = cand
      }
    }
    if (best) bySpecimen['urine|ACR'] = best
  }

  const age = demographics.age
  const sex = demographics.gender && demographics.gender !== 'unknown' && demographics.gender !== 'other'
    ? demographics.gender
    : undefined

  const resolve = (source?: AutofillSource): AutofillValue | undefined => {
    if (!source) return undefined
    switch (source.kind) {
      case 'lab':
        // Prefer a blood-specimen match so a serum analyte never picks up a
        // same-named urine value (urine Na also canonicalises to NA); fall
        // back to any specimen when the field is absent (older bundles).
        for (const k of source.keys) {
          if (bySpecimen[`blood|${k}`]) return bySpecimen[`blood|${k}`]
        }
        for (const k of source.keys) {
          if (byCanonical[k]) return byCanonical[k]
        }
        return undefined
      case 'labSpecimen':
        // Authoritative specimen match first, then LOINC fallback.
        for (const k of source.keys) {
          if (bySpecimen[`${source.specimen}|${k}`]) return bySpecimen[`${source.specimen}|${k}`]
        }
        for (const code of source.loinc ?? []) {
          if (byLoinc[code]) return byLoinc[code]
        }
        return undefined
      case 'vital':
        // LOINC first (trusted); then a display-name fallback for FHIR that
        // omits the vital's LOINC (already unit-gated at index time).
        for (const code of source.loinc) {
          if (byLoinc[code]) return byLoinc[code]
        }
        if (source.vital && byVital[source.vital]) return byVital[source.vital]
        return undefined
      case 'labLoinc':
        for (const code of source.loinc) {
          if (byLoinc[code]) return byLoinc[code]
        }
        return undefined
      case 'age':
        return typeof age === 'number' ? { value: age, unit: 'y', date: '' } : undefined
      case 'sex':
        return undefined // sex is a select; handled separately via `sex`
      default:
        return undefined
    }
  }

  return { resolve, sex }
}

export function useLabAutofill(): Autofill {
  const { observations } = useClinicalData()
  const { patient } = usePatient()

  return useMemo(
    () => buildAutofill(observations as ObsLike[], { age: patient?.age, gender: patient?.gender }),
    [observations, patient],
  )
}
