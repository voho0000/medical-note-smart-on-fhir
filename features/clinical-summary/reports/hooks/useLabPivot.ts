// Build pivot data for cumulative lab report view.
// Groups observations by lab category, then pivots into test (row) × date (column).
import { useMemo } from 'react'
import { categorizeObservation, getTestDisplayName, compareTestsByPreferred, LAB_CATEGORIES, type LabCategory } from '@/src/shared/utils/lab-categories'

export interface LabCell {
  value: string
  unit?: string
  interpretationCode?: string  // 'H'|'L'|'N'|'A'|'AA'|'HH'|'LL' (HL7)
  isAbnormal?: boolean
  effectiveDateTime?: string
}

export interface LabRow {
  testKey: string             // normalized identifier (used as map key)
  displayName: string         // shown in left column
  unit?: string               // unit summary (most common across all dates)
  values: Map<string, LabCell>  // date "YYYY-MM-DD" → cell
}

export interface LabPivot {
  category: LabCategory
  dates: string[]   // sorted desc (newest first)
  rows: LabRow[]
}

function dateKey(s?: string): string | null {
  return s ? s.slice(0, 10) : null
}

function formatValue(obs: any): { value: string; unit?: string; isAbnormal: boolean; interpretationCode?: string } {
  let value = '—'
  let unit: string | undefined
  if (obs.valueQuantity?.value !== undefined && obs.valueQuantity?.value !== null) {
    value = String(obs.valueQuantity.value)
    unit = obs.valueQuantity.unit || obs.valueQuantity.code
  } else if (obs.valueString) {
    value = obs.valueString
  } else if (obs.valueCodeableConcept?.text) {
    value = obs.valueCodeableConcept.text
  }
  const interp = obs.interpretation?.[0]?.coding?.[0]?.code || obs.interpretation?.coding?.[0]?.code
  const isAbnormal = !!interp && !['N', 'NORMAL'].includes(String(interp).toUpperCase())
  return { value, unit, isAbnormal, interpretationCode: interp }
}

function pickKey(obs: any): string {
  // Prefer the textual display name as the row identifier so VGH variants
  // like "T.BILI" vs "T.BILI." are visually separated as the user expects.
  return getTestDisplayName(obs).trim().toUpperCase()
}

export function useLabPivot(observations: any[]): Record<string, LabPivot> {
  return useMemo(() => {
    const result: Record<string, LabPivot> = {}

    // Initialize each category container
    for (const cat of LAB_CATEGORIES) {
      result[cat.id] = { category: cat, dates: [], rows: [] }
    }

    // Group observations by category
    const buckets: Record<string, any[]> = {}
    for (const cat of LAB_CATEGORIES) buckets[cat.id] = []

    for (const obs of observations) {
      const cat = categorizeObservation(obs)
      if (!cat) continue
      buckets[cat.id].push(obs)
    }

    // For each category, build the pivot
    for (const cat of LAB_CATEGORIES) {
      const obsList = buckets[cat.id]
      if (obsList.length === 0) continue

      const dateSet = new Set<string>()
      const testMap = new Map<string, LabRow>()
      const unitCount = new Map<string, Map<string, number>>()

      for (const obs of obsList) {
        const date = dateKey(obs.effectiveDateTime)
        if (!date) continue
        dateSet.add(date)

        const key = pickKey(obs)
        const displayName = getTestDisplayName(obs)
        const { value, unit, isAbnormal, interpretationCode } = formatValue(obs)

        if (!testMap.has(key)) {
          testMap.set(key, { testKey: key, displayName, values: new Map() })
          unitCount.set(key, new Map())
        }
        const row = testMap.get(key)!
        const cell: LabCell = {
          value,
          unit,
          isAbnormal,
          interpretationCode,
          effectiveDateTime: obs.effectiveDateTime,
        }
        // If multiple observations on same day, keep the last one (could be revised result)
        row.values.set(date, cell)
        if (unit) {
          const ucMap = unitCount.get(key)!
          ucMap.set(unit, (ucMap.get(unit) || 0) + 1)
        }
      }

      // Pick most common unit per row
      for (const [key, ucMap] of unitCount.entries()) {
        let bestUnit: string | undefined
        let bestCount = 0
        for (const [u, c] of ucMap.entries()) {
          if (c > bestCount) {
            bestCount = c
            bestUnit = u
          }
        }
        const row = testMap.get(key)
        if (row) row.unit = bestUnit
      }

      const dates = [...dateSet].sort((a, b) => b.localeCompare(a))  // newest first
      const cmp = compareTestsByPreferred(cat)
      const rows = [...testMap.values()].sort((a, b) => cmp(a.testKey, b.testKey))

      result[cat.id] = { category: cat, dates, rows }
    }

    return result
  }, [observations])
}
