// useMedicationSourceMix
// Looks at the medication list and reports what kind of source data it came
// from. Drives a card-level hint (when every row is a MedicationStatement,
// e.g. an IPS import) vs a per-row chip (when the list is mixed). Bridge data
// is the dominant case — every row is a MedicationRequest, so the hook
// returns 'request-only' and the medications panel renders unchanged.
import { useMemo } from 'react'
import type { MedicationRow } from '../types'

export type MedicationSourceMix =
  | 'none'            // empty list
  | 'request-only'    // all rows are MedicationRequest (bridge default — show nothing)
  | 'statement-only'  // all rows are MedicationStatement (typical IPS — show banner)
  | 'mixed'           // both kinds present (rare — show per-row chip)

export function useMedicationSourceMix(rows: MedicationRow[]): MedicationSourceMix {
  return useMemo(() => {
    if (!rows.length) return 'none'
    let hasRequest = false
    let hasStatement = false
    for (const r of rows) {
      // Anything without an explicit marker counts as MedicationRequest
      // (bridge data path never stamps the field).
      if (r.sourceResourceType === 'MedicationStatement') {
        hasStatement = true
      } else {
        hasRequest = true
      }
      if (hasRequest && hasStatement) return 'mixed'
    }
    if (hasStatement && !hasRequest) return 'statement-only'
    return 'request-only'
  }, [rows])
}
