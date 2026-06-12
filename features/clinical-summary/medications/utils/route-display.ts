// SNOMED CT route-of-administration display map (display canonicalisation).
//
// Why: TW-Core / IPS bundles often carry `dosageInstruction.route` as a bare
// SNOMED coding with NO display/text, so the generic CodeableConcept fallback
// (text → display → code) rendered raw concept ids like "26643006" in the
// medication list. This maps the COMMON route concepts to human labels; any
// unmapped code still falls through to the raw id (never hidden).
//
// VERIFICATION (2026-06-12): every concept id below was verified against TWO
// authoritative sources — tx.fhir.org $lookup (official SNOMED CT release,
// all active) and the HL7 FHIR R4 route-codes value set
// (hl7.org/fhir/R4/valueset-route-codes.html). Do NOT add ids to this table
// without the same verification (memory/feedback_snomed_ct_verification.md).

import type { CodeableConcept } from '@/src/shared/types/fhir.types'

const SCT_SYSTEM = 'http://snomed.info/sct'

/** Verified SNOMED CT route concepts → localized labels. */
export const SCT_ROUTE_LABELS: Record<string, { zh: string; en: string }> = {
  '26643006': { zh: '口服', en: 'Oral' },
  '34206005': { zh: '皮下注射', en: 'Subcutaneous' },
  '47625008': { zh: '靜脈注射', en: 'Intravenous' },
  '78421000': { zh: '肌肉注射', en: 'Intramuscular' },
  '6064005': { zh: '外用', en: 'Topical' },
  '37839007': { zh: '舌下', en: 'Sublingual' },
  '37161004': { zh: '直腸', en: 'Rectal' },
  '46713006': { zh: '鼻用', en: 'Nasal' },
  '54485002': { zh: '眼用', en: 'Ophthalmic' },
  '447694001': { zh: '吸入（呼吸道）', en: 'Respiratory tract' },
  '45890007': { zh: '經皮', en: 'Transdermal' },
}

/**
 * Human-readable route text. Same precedence as getCodeableConceptText
 * (text → coding display) but with one extra rung before the raw-code
 * fallback: a verified SNOMED route label, locale-aware. Returns "—" when
 * there is nothing at all (keeps the existing sentinel the UI filters on).
 */
export function routeDisplayText(route: CodeableConcept | undefined, locale = 'zh-TW'): string {
  if (!route) return '—'
  if (route.text) return route.text
  const codings = route.coding ?? []
  const withDisplay = codings.find((c) => c.display)
  if (withDisplay?.display) return withDisplay.display

  const lang: 'zh' | 'en' = locale.startsWith('zh') ? 'zh' : 'en'
  for (const c of codings) {
    if (!c.code) continue
    // Only map when the coding is SNOMED (or carries no system at all — some
    // scenario bundles omit it); a numeric code from another system must not
    // accidentally hit the SNOMED table.
    if (c.system && c.system !== SCT_SYSTEM) continue
    const label = SCT_ROUTE_LABELS[c.code]
    if (label) return label[lang]
  }
  return codings[0]?.code || '—'
}
