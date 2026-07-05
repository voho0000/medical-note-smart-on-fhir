// useLabAutofill — resolves calculator input sources against the current
// patient's most-recent observations + demographics.
//
// Lab analytes resolve through the shared canonical layer (getAnalyteCanonicalKey),
// the same one the cumulative report uses, so cross-institution name/LOINC
// variants collapse correctly. Weight/height are vital signs that live outside
// the canonical lab map, so they're matched by LOINC directly.

import { useMemo } from 'react'
import { useClinicalData } from '@/src/application/hooks/clinical-data/use-clinical-data-query.hook'
import { usePatient } from '@/src/application/hooks/patient/use-patient-query.hook'
import { getAnalyteCanonicalKey } from '@/src/shared/utils/lab-normalize'
import type { AutofillSource } from '../types'

export interface AutofillValue {
  value: number
  unit: string
  /** effectiveDateTime of the source observation (ISO), for the "from <date>" hint. */
  date: string
}

export interface Autofill {
  resolve: (source?: AutofillSource) => AutofillValue | undefined
  sex?: string
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

export function useLabAutofill(): Autofill {
  const { observations } = useClinicalData()
  const { patient } = usePatient()

  return useMemo(() => {
    const byCanonical: Record<string, AutofillValue> = {}
    const byLoinc: Record<string, AutofillValue> = {}
    // Keyed by `${specimen}|${canonicalKey}` (e.g. "blood|NA", "urine|CREA").
    const bySpecimen: Record<string, AutofillValue> = {}

    for (const obs of observations) {
      const value = obs.valueQuantity?.value
      if (typeof value !== 'number' || !Number.isFinite(value)) continue
      const entry: AutofillValue = {
        value,
        unit: obs.valueQuantity?.unit ?? '',
        date: obs.effectiveDateTime ?? '',
      }

      const key = getAnalyteCanonicalKey(obs)
      if (key) byCanonical[key] = keepLatest(byCanonical[key], entry)

      const spec = normSpecimen(obs.specimen?.display)
      if (key && spec) {
        const sk = `${spec}|${key}`
        bySpecimen[sk] = keepLatest(bySpecimen[sk], entry)
      }

      for (const c of obs.code?.coding ?? []) {
        if (c?.code) byLoinc[c.code] = keepLatest(byLoinc[c.code], entry)
      }
    }

    const age = patient?.age
    const sex = patient?.gender && patient.gender !== 'unknown' && patient.gender !== 'other'
      ? patient.gender
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
  }, [observations, patient])
}
