// Per-visit summary stats derived from EncounterDetails.
// Used by VisitHistoryCard to drive content-based filters (含檢驗 etc.) and
// to display an abnormal-result badge on each visit row.
import { useMemo } from 'react'
import type { EncounterDetails } from './useEncounterDetails'

export interface VisitStats {
  hasTests: boolean
  hasMedications: boolean
  hasProcedures: boolean
  hasDiagnoses: boolean
  testCount: number
  abnormalCount: number
}

function obsAbnormal(obs: any): boolean {
  if (obs?.refRangeAbnormal) return true
  const style = obs?.interpretationStyle
  if (typeof style === 'string' && style.includes('red')) return true
  return false
}

function countAbnormal(details: EncounterDetails | undefined): number {
  if (!details?.tests?.length) return 0
  let n = 0
  for (const t of details.tests) {
    if (obsAbnormal(t)) { n++; continue }
    if (Array.isArray(t.components) && t.components.some(obsAbnormal)) n++
  }
  return n
}

export function useVisitStats(
  encounterDetails: Map<string, EncounterDetails>
): Map<string, VisitStats> {
  return useMemo(() => {
    const map = new Map<string, VisitStats>()
    encounterDetails.forEach((d, id) => {
      map.set(id, {
        hasTests:        d.tests.length > 0,
        hasMedications:  d.medications.length > 0,
        hasProcedures:   d.procedures.length > 0,
        hasDiagnoses:    d.diagnoses.length > 0,
        testCount:       d.tests.length,
        abnormalCount:   countAbnormal(d),
      })
    })
    return map
  }, [encounterDetails])
}
