"use client"

// Adaptive default for data-sparse patients: when a patient's WHOLE record is
// small enough to fit comfortably, default to 全部資料 (all categories +
// all-time windows + all documents) so nothing is needlessly hidden. For a
// data-heavy patient (ICU / onco) the factory 初診 window still applies.
//
// Why a TOKEN estimate, not a record count: documents dominate context size —
// a single discharge summary can be ~10k tokens while a chatty outpatient may
// have hundreds of tiny structured rows. Counting records alone would both
// miss a small-but-document-heavy patient and needlessly widen a
// many-visits-but-tiny-notes patient. So we estimate the actual context weight.
//
// Guardrails so this never fights the user:
//  • only when the 初診 template is active AND filters are still pristine
//    factory defaults (the moment the user tweaks anything, we stop);
//  • once per bundle (keyed by a cheap signature), so re-renders don't re-apply;
//  • reversible — 還原範本預設 restores the 6-month factory filters;
//  • a one-time toast tells the user why the whole record was pulled in.
import { useEffect, useRef } from "react"
import { toast } from "sonner"
import { useDataSelection } from "@/src/application/providers/data-selection.provider"
import { useLanguage } from "@/src/application/providers/language.provider"
import { DEFAULT_DATA_FILTERS } from "@/src/shared/constants/data-selection.constants"
import { estimateTokens } from "@/src/shared/utils/token-estimator"
import { listClinicalDocuments } from "@/src/core/utils/clinical-documents.utils"
import type { DataFilters } from "@/src/core/entities/clinical-context.entity"
import type { ClinicalDataCollection } from "@/src/core/entities/clinical-data.entity"

// Auto-select-all when the whole record is estimated at or below this many
// context tokens — small enough to leave ample headroom even on the tightest
// model window (GPT ~120k), so pulling everything in is safe.
export const AUTO_SELECT_ALL_TOKENS = 40_000

// Skip the (document-decoding) estimate entirely above this structured-record
// count: such a patient is unambiguously data-heavy, so there's no point
// decoding their documents just to confirm they're over budget.
const HARD_SKIP_STRUCTURED = 600

// Rough tokens-per-structured-record. Deliberately generous (labs fold into
// per-analyte trends, so raw counts over-estimate) — an over-estimate only ever
// makes us MORE conservative about auto-selecting, never less.
const TOKENS_PER_RECORD = 15

const STRUCTURED_KEYS = [
  'observations',
  'diagnosticReports',
  'imagingStudies',
  'medications',
  'procedures',
  'encounters',
  'conditions',
  'vitalSigns',
  'immunizations',
  'allergies',
  'carePlans',
  'devices',
  'consents',
]

function countStructured(data: ClinicalDataCollection): number {
  const d = data as unknown as Record<string, unknown[]>
  return STRUCTURED_KEYS.reduce((sum, k) => sum + (Array.isArray(d[k]) ? d[k].length : 0), 0)
}

/** Estimate the context-token weight of the patient's ENTIRE record. Exported
 *  for testing. */
export function estimateFullRecordTokens(data: ClinicalDataCollection): number {
  const structured = countStructured(data)
  if (structured > HARD_SKIP_STRUCTURED) return Number.POSITIVE_INFINITY
  const structuredTokens = structured * TOKENS_PER_RECORD
  // Documents are the dominant, variable term — decode (cached) every document
  // and sum its real token weight.
  const docTokens = listClinicalDocuments(
    data as unknown as Parameters<typeof listClinicalDocuments>[0],
  ).reduce((sum, doc) => sum + estimateTokens(doc.text), 0)
  return structuredTokens + docTokens
}

/** Are the filters still exactly the factory 初診 defaults (user hasn't tweaked)? */
function isPristineDefaultFilters(filters: DataFilters): boolean {
  const keys = Object.keys(DEFAULT_DATA_FILTERS) as (keyof DataFilters)[]
  return keys.every((k) => filters[k] === DEFAULT_DATA_FILTERS[k])
}

export function useAdaptiveDataDefaults(clinicalData: ClinicalDataCollection | null): void {
  const { filters, activePreset, selectAllData } = useDataSelection()
  const { t } = useLanguage()
  const appliedSigRef = useRef<string | null>(null)

  useEffect(() => {
    if (!clinicalData) return
    const structured = countStructured(clinicalData)
    // Cheap per-bundle signature so we evaluate once per loaded patient.
    const sig = `${structured}`
    if (appliedSigRef.current === sig) return

    // Only act on the pristine 初診 default — never override a user's own or a
    // 追蹤 / 自訂 selection.
    if (activePreset !== 'newPatient' || !isPristineDefaultFilters(filters)) {
      appliedSigRef.current = sig
      return
    }

    if (structured > 0 && estimateFullRecordTokens(clinicalData) <= AUTO_SELECT_ALL_TOKENS) {
      selectAllData()
      const ds = t.dataSelection as unknown as Record<string, string>
      toast.info(ds.autoSelectAllToast ?? '因資料量少,已自動帶入全部資料(可在「資料範圍」調整)。')
    }
    appliedSigRef.current = sig
  }, [clinicalData, filters, activePreset, selectAllData, t])
}
