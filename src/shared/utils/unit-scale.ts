// UCUM scale normalisation for the CUMULATIVE lab report only.
//
// The NHI 健保存摺 bridge faithfully passes each source lab's unit, so the SAME
// analyte arrives at different scales across hospitals/dates:
//   • blood counts — WBC as "K/µL" (~5) vs raw "/µL" (~5600), RBC "M/µL" (~4) vs
//     "x10^4/µL" (~400);
//   • CRP — "mg/dL" (~0.5) at one hospital vs "mg/L" (~5) at another (×10).
// In one cumulative-report column that reads as "0.5 next to 5", which is
// meaningless. We convert every value of such an analyte to one canonical unit
// via its UCUM scale factor — a lossless ×10^n.
//
// SCOPED TO THE CUMULATIVE REPORT: the raw row-by-row report keeps each value in
// its source unit. We only rescale units we positively recognise; anything else
// is returned untouched, so a unit we don't understand is never silently mangled.

export interface NormalizedValue {
  value: number
  unit: string
}

/**
 * Scale of a count-per-microlitre unit relative to "/µL" = 1. Returns null for
 * anything that is NOT a recognised count-per-µL unit. Handles the spelling /
 * notation variants the bridge emits:
 *   /µL · k/µL · K/µL · 1000/µL · *1000/µL · x10^3/µL · 10^3/µL
 *   x10^4/µL · M/µL · million/µL · *10^6/µL · 10^6/µL
 */
export function cellConcScale(rawUnit: string | undefined | null): number | null {
  if (!rawUnit) return null
  const u = String(rawUnit).toLowerCase().replace(/\s+/g, '').replace(/μ/g, 'u')
  if (!u.endsWith('/ul')) return null
  const p = u.slice(0, -3).replace(/[*x×·^]/g, '')
  if (p === '') return 1
  if (p === 'k') return 1e3
  if (p === '1000' || p === '103') return 1e3
  if (p === '104') return 1e4
  if (p === 'm' || p === 'million') return 1e6
  if (p === '106') return 1e6
  return null
}

/**
 * Scale of a mass-per-volume unit relative to "mg/L" = 1. Returns null for
 * anything not recognised. Note 1 mg/dL = 10 mg/L (dL is 1/10 L).
 */
export function massConcScale(rawUnit: string | undefined | null): number | null {
  if (!rawUnit) return null
  const u = String(rawUnit).toLowerCase().replace(/\s+/g, '').replace(/μ/g, 'u')
  if (u === 'mg/l') return 1
  if (u === 'mg/dl') return 10
  if (u === 'g/l') return 1000
  if (u === 'g/dl') return 10000
  return null
}

// Per-analyte canonical unit + which family's scale factor to use, keyed by
// canonical testKey. Add a line here as the multi-hospital data surfaces new
// scale-mixed analytes (e.g. ANC / reticulocyte → cellConcScale).
const UNIT_NORMALIZATION: Record<
  string,
  { unit: string; scale: number; scaleOf: (u: string | undefined | null) => number | null }
> = {
  WBC: { unit: 'K/µL', scale: 1e3, scaleOf: cellConcScale },
  RBC: { unit: 'M/µL', scale: 1e6, scaleOf: cellConcScale },
  PLT: { unit: 'K/µL', scale: 1e3, scaleOf: cellConcScale },
  // CRP: mg/dL is the Taiwan-common unit; mg/L (international / hs-CRP) values
  // are ÷10 onto it. (mg/L base = 1, mg/dL = 10.)
  CRP: { unit: 'mg/dL', scale: 10, scaleOf: massConcScale },
}

// Round off float noise from the ×10^n conversion (5600/1000 = 5.6), ~4 sig figs.
function tidy(n: number): number {
  if (!isFinite(n) || n === 0) return n
  const d = Math.max(0, Math.min(6, 4 - Math.ceil(Math.log10(Math.abs(n)))))
  return Number(n.toFixed(d))
}

/**
 * If `testKey` is a configured analyte AND `rawUnit` is a recognised unit in that
 * analyte's family, return the value rescaled to its canonical unit. Otherwise
 * null — the caller keeps the original value/unit untouched.
 */
export function normalizeAnalyteUnit(
  testKey: string | undefined,
  value: number,
  rawUnit: string | undefined | null,
): NormalizedValue | null {
  if (!testKey) return null
  const cfg = UNIT_NORMALIZATION[testKey.toUpperCase()]
  if (!cfg) return null
  const rawScale = cfg.scaleOf(rawUnit)
  if (rawScale === null) return null
  return { value: tidy(value * (rawScale / cfg.scale)), unit: cfg.unit }
}
