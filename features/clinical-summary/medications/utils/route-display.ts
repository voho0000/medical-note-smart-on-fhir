// SNOMED CT route-of-administration display map (display canonicalisation).
//
// Why: TW-Core / IPS bundles often carry `dosageInstruction.route` as a bare
// SNOMED coding with NO display/text, so the generic CodeableConcept fallback
// (text → display → code) rendered raw concept ids like "26643006" in the
// medication list. This maps the COMMON route concepts to per-audience labels
// — medical staff get the clinical abbreviation (PO / SC / IV…), patients get
// plain language (口服 / 皮下注射…) — the same audience convention used for
// drug names (pickLocalizedText). Any unmapped code still falls through to
// the raw id (never hidden).
//
// VERIFICATION (2026-06-12): every concept id below was verified against TWO
// authoritative sources — tx.fhir.org $lookup (official SNOMED CT release,
// all active) and the HL7 FHIR R4 route-codes value set
// (hl7.org/fhir/R4/valueset-route-codes.html). Do NOT add ids to this table
// without the same verification (memory/feedback_snomed_ct_verification.md).

import type { CodeableConcept } from '@/src/shared/types/fhir.types'

const SCT_SYSTEM = 'http://snomed.info/sct'

/** Verified SNOMED CT route concepts → per-audience labels. `abbr` is the
 *  standard clinical sig abbreviation used on Taiwanese hospital MARs. */
export const SCT_ROUTE_LABELS: Record<string, { zh: string; en: string; abbr: string }> = {
  '26643006': { zh: '口服', en: 'Oral', abbr: 'PO' },
  '34206005': { zh: '皮下注射', en: 'Subcutaneous', abbr: 'SC' },
  '47625008': { zh: '靜脈注射', en: 'Intravenous', abbr: 'IV' },
  '78421000': { zh: '肌肉注射', en: 'Intramuscular', abbr: 'IM' },
  '6064005': { zh: '外用', en: 'Topical', abbr: 'TOP' },
  '37839007': { zh: '舌下', en: 'Sublingual', abbr: 'SL' },
  '37161004': { zh: '直腸', en: 'Rectal', abbr: 'PR' },
  '46713006': { zh: '鼻用', en: 'Nasal', abbr: 'NAS' },
  '54485002': { zh: '眼用', en: 'Ophthalmic', abbr: 'OPH' },
  '447694001': { zh: '吸入（呼吸道）', en: 'Respiratory tract', abbr: 'INH' },
  '45890007': { zh: '經皮', en: 'Transdermal', abbr: 'TD' },
}

export interface RouteDisplayOptions {
  /** medical → clinical abbreviation (PO); patient → plain language (口服). */
  audience?: 'medical' | 'patient'
  /** Picks zh vs en for the patient label. */
  locale?: string
}

/** Find the verified label for the first SNOMED (or system-less) coding. */
function lookupLabel(route?: CodeableConcept): { zh: string; en: string; abbr: string } | undefined {
  for (const c of route?.coding ?? []) {
    if (!c.code) continue
    // Only map SNOMED codings (or ones with no system at all — some scenario
    // bundles omit it); a numeric code from another system must not
    // accidentally hit the SNOMED table.
    if (c.system && c.system !== SCT_SYSTEM) continue
    const label = SCT_ROUTE_LABELS[c.code]
    if (label) return label
  }
  return undefined
}

/**
 * Human-readable route text, audience-aware.
 * Precedence: source free text → verified SNOMED label (per audience) →
 * coding display → raw code → "—" (the sentinel the UI filters on).
 * The verified label deliberately outranks `coding.display` so a mapped
 * concept renders canonically (PO / 口服) instead of e.g. "Oral route".
 */
export function routeDisplayText(
  route: CodeableConcept | undefined,
  opts: RouteDisplayOptions = {},
): string {
  const { audience = 'medical', locale = 'zh-TW' } = opts
  if (!route) return '—'
  if (route.text) return route.text

  const label = lookupLabel(route)
  if (label) {
    if (audience === 'medical') return label.abbr
    return locale.startsWith('zh') ? label.zh : label.en
  }

  const codings = route.coding ?? []
  const withDisplay = codings.find((c) => c.display)
  if (withDisplay?.display) return withDisplay.display
  return codings[0]?.code || '—'
}

/**
 * Canonical English abbreviation (PO / SC / …) for a mapped SNOMED route, or
 * undefined. Audience-free — used by the AI clinical-context builder, which
 * always speaks canonical English regardless of UI language.
 */
export function routeAbbr(route?: CodeableConcept): string | undefined {
  return lookupLabel(route)?.abbr
}
