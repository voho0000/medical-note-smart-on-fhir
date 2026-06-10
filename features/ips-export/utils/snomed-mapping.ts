// IPS Phase 2.1 — deterministic ICD-10 → SNOMED CT problem-list coding.
//
// The IPS Problem List expects SNOMED CT `(disorder)` concepts, but the app's
// conditions arrive coded only in ICD-10 (NHI billing ICD / 重大傷病). This
// module is a small, *verified* allowlist that upgrades the most common chronic
// and catastrophic-illness (重大傷病) diagnoses to a SNOMED CT concept with HIGH
// confidence — no LLM, no guessing. The LLM-assisted ladder (Strategy C/A) lands
// in Phase 2.2.
//
// ── VERIFICATION (memory/feedback_snomed_ct_verification.md — MANDATORY) ──────
// EVERY concept id below was verified, before being written, against the HL7
// FHIR terminology server tx.fhir.org using the SNOMED CT International edition
// (CodeSystem version http://snomed.info/sct/900000000000207008/version/20250201):
//   • CodeSystem/$lookup (system=http://snomed.info/sct&code=<id>) → confirmed the
//     concept is ACTIVE and returned its preferred display + FSN designation.
//   • ValueSet/$expand of `http://snomed.info/sct?fhir_vs=isa/64572001`
//     (Disease (disorder) subtree) with &filter=<term> → confirmed each id is a
//     descendant of 64572001 |Disease (disorder)|, i.e. carries the `(disorder)`
//     semantic tag required by IPS Condition.code.
// The `display` strings are the server-returned SNOMED preferred terms.
//
// NOTE on asthma: the plain "Asthma (disorder)" concept could not be confirmed
// active in the current International edition via the disorder-subtree search
// (candidate 195967009 resolved as not-found/retired), so asthma is intentionally
// EXCLUDED rather than coded from an unverified id. It can be added in a later
// pass once a current id is verified.
//
// Pure functions only (no React, no I/O) — the verification happened offline and
// the result is frozen here as data.

import type { ConditionEntity } from '@/src/core/entities/clinical-data.entity'
import { SYSTEM } from './ips-constants'

export const SCT_SYSTEM = SYSTEM.snomed

/** A verified SNOMED CT disorder concept (active, `(disorder)` hierarchy). */
export interface VerifiedSct {
  /** SNOMED CT concept id. */
  code: string
  /** SNOMED CT preferred term (server-returned). */
  display: string
}

/** SCT annotation attached to a ConditionEntity (`_sct`). */
export interface ConditionSctAnnotation extends VerifiedSct {
  system: typeof SCT_SYSTEM
  /**
   * Confidence ladder (plan Q2):
   *   high        — deterministic hit in this verified table (Strategy B).
   *   medium-high — LLM picked from the verified allowlist (Strategy C, Phase 2.2).
   *   low         — LLM free-generated, no allowlist match (Strategy A, Phase 2.2).
   */
  confidence: 'high' | 'medium-high' | 'low'
  /** The normalized ICD-10 code that produced this mapping (traceability). */
  icd10?: string
  /** Set when the code should be manually reviewed (low-confidence LLM output). */
  needsManualCoding?: boolean
}

// ── Verified ICD-10-CM → SNOMED CT (disorder) allowlist ──────────────────────
//
// Two tiers, consulted in order (see lookupSctForIcd):
//   1. EXACT  — keyed by a full code (with dot). Used for *heterogeneous* ICD
//      categories where the 3-char root spans clinically different disorders
//      (e.g. E78.x mixes hypercholesterolemia vs. hyperlipidemia; C22.x mixes
//      hepatocellular vs. bile-duct carcinoma) and for the specific N18.6 = ESRD
//      carve-out that must win over the N18 = CKD root.
//   2. ROOT   — keyed by the 3-char category (e.g. E11, N18, J44). Used for
//      *homogeneous* categories whose every subcode is the same disorder.
//
// All displays are the SNOMED preferred terms returned by tx.fhir.org.

const SCT_BY_EXACT_ICD: Readonly<Record<string, VerifiedSct>> = {
  // E78.x is heterogeneous — only the "hyperlipidemia, unspecified" leaf maps.
  'E78.5': { code: '55822004', display: 'Hyperlipidemia' },
  // N18.6 = ESRD must win over the N18 = CKD root below.
  'N18.6': { code: '46177005', display: 'End stage kidney disease' },
  // I25.x is heterogeneous (old MI, ischemic cardiomyopathy, …); only the
  // atherosclerotic-heart-disease leaves map to coronary arteriosclerosis.
  'I25.1': { code: '53741008', display: 'Coronary arteriosclerosis' },
  'I25.10': { code: '53741008', display: 'Coronary arteriosclerosis' },
  // C22.x is heterogeneous — only the liver-cell-carcinoma leaf maps.
  'C22.0': { code: '109841003', display: 'Hepatocarcinoma' },
  // K74.x is heterogeneous (fibrosis/sclerosis/biliary); only the cirrhosis
  // leaves map to "Cirrhosis of liver".
  'K74.6': { code: '19943007', display: 'Cirrhosis of liver' },
  'K74.60': { code: '19943007', display: 'Cirrhosis of liver' },
  'K74.69': { code: '19943007', display: 'Cirrhosis of liver' },
}

const SCT_BY_ICD_ROOT: Readonly<Record<string, VerifiedSct>> = {
  // Endocrine / metabolic
  E11: { code: '44054006', display: 'Diabetes mellitus type II' },
  E10: { code: '46635009', display: 'Diabetes mellitus type I' },
  E03: { code: '40930008', display: 'Hypothyroidism' },
  // Circulatory
  I10: { code: '59621000', display: 'Essential hypertension' },
  I50: { code: '84114007', display: 'Heart failure' },
  I48: { code: '49436004', display: 'Atrial fibrillation' },
  I63: { code: '432504007', display: 'Cerebral infarction' },
  // Renal
  N18: { code: '709044004', display: 'Chronic kidney disease' },
  N04: { code: '52254009', display: 'Nephrotic syndrome' },
  // Respiratory
  J44: { code: '13645005', display: 'Chronic obstructive lung disease' },
  // Digestive
  K21: { code: '235595009', display: 'Gastroesophageal reflux disease' },
  // Mental / neurological
  F32: { code: '370143000', display: 'Major depressive disorder' },
  G20: { code: '49049000', display: "Parkinson's disease" },
  G30: { code: '26929004', display: "Alzheimer's disease" },
  G35: { code: '24700007', display: 'Multiple sclerosis' },
  // Musculoskeletal / autoimmune
  M17: { code: '239873007', display: 'Osteoarthritis of knee' },
  M05: { code: '69896004', display: 'Rheumatoid arthritis' },
  M06: { code: '69896004', display: 'Rheumatoid arthritis' },
  M32: { code: '55464009', display: 'Systemic lupus erythematosus' },
  // Catastrophic illness — malignant neoplasms (重大傷病)
  C34: { code: '93880001', display: 'Primary malignant neoplasm of lung' },
  C50: { code: '254837009', display: 'Malignant tumor of breast' },
  C18: { code: '363406005', display: 'Malignant tumour of colon' },
  C16: { code: '363349007', display: 'Malignant tumor of stomach' },
  C61: { code: '399068003', display: 'Malignant tumour of prostate' },
  // Infectious / immune
  B20: { code: '86406008', display: 'Human immunodeficiency virus infection' },
}

/**
 * Normalize an ICD-10 code for table lookup: uppercase, strip whitespace and a
 * trailing dot, and insert the conventional dot after the 3-char category when a
 * dotless extension is present (e.g. "e119" → "E11.9", "N186" → "N18.6").
 */
export function normalizeIcd(raw: string | undefined): string {
  if (!raw) return ''
  let s = raw.toUpperCase().replace(/\s+/g, '').replace(/\.+$/, '')
  if (!s) return ''
  // Dotless code with an extension → re-insert the dot after the category root.
  if (!s.includes('.') && s.length > 3 && /^[A-Z]\d{2}[A-Z0-9]+$/.test(s)) {
    s = `${s.slice(0, 3)}.${s.slice(3)}`
  }
  return s
}

/** True for strings shaped like an ICD-10(-CM) code (e.g. "E11", "N18.6"). */
function looksLikeIcd10(code: string): boolean {
  return /^[A-Z]\d{2}(\.[A-Z0-9]+)?$/.test(code)
}

/**
 * Deterministically map an ICD-10 code to a verified SNOMED CT disorder concept.
 * Exact full-code match wins (heterogeneous categories + N18.6/ESRD carve-out),
 * then the 3-char category root. Returns null when the code is not in the
 * verified allowlist — callers must NOT invent a code (Phase 2.2 LLM territory).
 */
export function lookupSctForIcd(rawIcd: string | undefined): VerifiedSct | null {
  const icd = normalizeIcd(rawIcd)
  if (!icd || !looksLikeIcd10(icd)) return null
  const exact = SCT_BY_EXACT_ICD[icd]
  if (exact) return exact
  const root = SCT_BY_ICD_ROOT[icd.slice(0, 3)]
  return root ?? null
}

/** True when a coding.system denotes ICD-10 / ICD-10-CM (or is unspecified). */
function isIcd10System(system: string | undefined): boolean {
  if (!system) return true // bridge sometimes omits the system on ICD codings
  return /icd-?10/i.test(system)
}

/**
 * Find a verified SNOMED CT mapping for a condition by scanning its ICD-10
 * codings. Returns a HIGH-confidence annotation (Strategy B) or null. Pure —
 * does not mutate the condition (the curation step attaches `_sct`).
 */
export function findSctForCondition(condition: ConditionEntity): ConditionSctAnnotation | null {
  for (const coding of condition.code?.coding ?? []) {
    const code = coding.code?.trim()
    if (!code) continue
    if (!isIcd10System(coding.system)) continue
    const normalized = normalizeIcd(code)
    if (!looksLikeIcd10(normalized)) continue
    const hit = lookupSctForIcd(normalized)
    if (hit) {
      return {
        system: SCT_SYSTEM,
        code: hit.code,
        display: hit.display,
        confidence: 'high',
        icd10: normalized,
      }
    }
  }
  return null
}
