// UCUM scale normalisation for the CUMULATIVE lab report only.
//
// Blood-count concentrations (WBC / RBC / PLT) arrive from the NHI 健保存摺 bridge
// with the SAME physical unit written at different scales — e.g. WBC as both
// "K/µL" (value ~5) and raw "/µL" (value ~5600), or RBC as "M/µL" (~4) vs
// "x10^4/µL" (~400). In one cumulative-report column that reads as "5 next to
// 5600", which is meaningless. We convert every value of such an analyte to one
// canonical unit via its UCUM scale factor — a lossless ×10^n.
//
// SCOPED TO THE CUMULATIVE REPORT: the raw row-by-row report keeps each value in
// its source unit (the original report still shows exactly what the bridge sent).
// We only rescale units we positively recognise; anything else is returned
// untouched, so a unit we don't understand is never silently mangled.

export interface NormalizedValue {
  value: number
  unit: string
}

/**
 * Scale of a count-per-microlitre unit relative to "/µL" = 1.
 * Returns null for anything that is NOT a recognised count-per-µL unit.
 * Handles the spelling/notation variants the bridge emits:
 *   /µL · k/µL · K/µL · 1000/µL · *1000/µL · x10^3/µL · 10^3/µL
 *   x10^4/µL · M/µL · million/µL · *10^6/µL · 10^6/µL
 */
export function cellConcScale(rawUnit: string | undefined | null): number | null {
  if (!rawUnit) return null
  const u = String(rawUnit).toLowerCase().replace(/\s+/g, '').replace(/μ/g, 'u')
  if (!u.endsWith('/ul')) return null
  // Drop "/ul" + any *, x, ×, ·, ^ so 1000 / *1000 / x10^3 / 10^3 all unify.
  const p = u.slice(0, -3).replace(/[*x×·^]/g, '')
  if (p === '') return 1
  if (p === 'k') return 1e3
  if (p === '1000' || p === '103') return 1e3
  if (p === '104') return 1e4
  if (p === 'm' || p === 'million') return 1e6
  if (p === '106') return 1e6
  return null
}

// Canonical target unit per blood-count analyte, keyed by canonical testKey.
const CELLCONC_CANONICAL: Record<string, { unit: string; scale: number }> = {
  WBC: { unit: 'K/µL', scale: 1e3 },
  RBC: { unit: 'M/µL', scale: 1e6 },
  PLT: { unit: 'K/µL', scale: 1e3 },
}

// Round off float noise from the ×10^n conversion (5600/1000 = 5.6), ~4 sig figs.
function tidy(n: number): number {
  if (!isFinite(n) || n === 0) return n
  const d = Math.max(0, Math.min(6, 4 - Math.ceil(Math.log10(Math.abs(n)))))
  return Number(n.toFixed(d))
}

/**
 * If `testKey` is a configured blood-count analyte AND `rawUnit` is a recognised
 * count-per-µL unit, return the value rescaled to that analyte's canonical unit.
 * Otherwise null — the caller keeps the original value/unit untouched.
 */
export function normalizeCellConcUnit(
  testKey: string | undefined,
  value: number,
  rawUnit: string | undefined | null,
): NormalizedValue | null {
  if (!testKey) return null
  const target = CELLCONC_CANONICAL[testKey.toUpperCase()]
  if (!target) return null
  const rawScale = cellConcScale(rawUnit)
  if (rawScale === null) return null
  return { value: tidy(value * (rawScale / target.scale)), unit: target.unit }
}
