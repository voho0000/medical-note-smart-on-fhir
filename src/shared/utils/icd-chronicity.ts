// ICD-10-CM chronicity from AHRQ HCUP's Chronic Condition Indicator Refined
// (CCIR). CCIR has no "acute" class: "not chronic" also covers pregnancy, benign
// neoplasms and conditions whose duration the code does not state, and Z / V–Y
// codes get no determination. Label the UI "非慢性", never "急性".
//
// Taiwan bills an older ICD-10-CM edition than CCIR's fiscal year. A code CCIR
// does not list resolves through its nearest listed parent when every code under
// that parent agrees; otherwise it stays undetermined rather than guessed.

import { CCIR_PREFIXES } from '@/src/shared/constants/ccir-chronicity.generated'

export type IcdChronicity = 'chronic' | 'nonChronic' | 'undetermined'

let table: Map<string, IcdChronicity> | null = null

function prefixTable(): Map<string, IcdChronicity> {
  if (table) return table
  table = new Map()
  for (const kind of ['chronic', 'nonChronic', 'undetermined'] as const) {
    for (const prefix of CCIR_PREFIXES[kind].split(',')) table.set(prefix, kind)
  }
  return table
}

export function icdChronicity(code: string): IcdChronicity {
  const key = code.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const prefixes = prefixTable()
  for (let i = key.length; i > 0; i--) {
    const hit = prefixes.get(key.slice(0, i))
    if (hit) return hit
  }
  return 'undetermined'
}
