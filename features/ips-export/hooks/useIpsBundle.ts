"use client"

import { useMemo } from 'react'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useClinicalDataQuery } from '@/src/application/hooks/clinical-data/use-clinical-data-query.hook'
import { usePatientQuery } from '@/src/application/hooks/patient/use-patient-query.hook'
import { useDataSelection } from '@/src/application/providers/data-selection.provider'
import { buildIpsBundle, type IpsSectionLabels } from '../utils/ips-builder'
import { curateForIps } from '../utils/ips-curation'
import { validateIpsBundle, type ValidationResult } from '../utils/ips-lite-validator'
import type { IpsBundle } from '../utils/ips-types'
import type { ClinicalDataCollection, ConditionEntity } from '@/src/core/entities/clinical-data.entity'
import type { PatientEntity } from '@/src/core/entities/patient.entity'

export interface UseIpsBundleResult {
  bundle: IpsBundle | null
  curatedData: ClinicalDataCollection | null
  patient: PatientEntity | null
  labels: Partial<IpsSectionLabels>
  validation: ValidationResult | null
  isLoading: boolean
  error: Error | null
  hasPatient: boolean
  /** Count of section entries across the document (excludes Composition + Patient). */
  resourceCount: number
}

/**
 * Build a (memoized) IPS document Bundle from the clinical data currently loaded
 * in the app, plus a lite structural validation. Pure assembly — no LLM.
 *
 * `extraConditions` lets a caller merge synthetic conditions (Phase 2.2 — the
 * user-CONFIRMED LLM-inferred problems) into the Problem List before the bundle
 * is built. They flow through the EXACT same mappers as source conditions
 * (dual-coding via `_sct`, `ai-inferred` meta.tag via `_inferred`), so there is
 * no FHIR-layer special-casing. Default `[]` ⇒ byte-identical to the pure path.
 */
export function useIpsBundle(extraConditions: ConditionEntity[] = []): UseIpsBundleResult {
  const { t } = useLanguage()
  const { data, isLoading: dataLoading, error } = useClinicalDataQuery()
  const { data: patient, isLoading: patientLoading } = usePatientQuery()
  const { getProfile } = useDataSelection()
  const ipsProfile = getProfile('ips')
  const ipsSelection = ipsProfile.selection
  const ipsFilters = ipsProfile.filters

  // Curate the full collection down to the IPS consumer's 資料選擇 (data-
  // selection) choices so the IPS is a coherent snapshot, not a multi-year dump.
  const curated = useMemo(
    () => (data ? curateForIps({ data, selection: ipsSelection, filters: ipsFilters }) : null),
    [data, ipsSelection, ipsFilters],
  )

  const labels = useMemo<Partial<IpsSectionLabels>>(() => {
    const s = t.ipsExport?.sections
    if (!s) return {}
    return {
      problemList: s.problemList,
      allergies: s.allergies,
      medications: s.medications,
      immunizations: s.immunizations,
      procedures: s.procedures,
      results: s.results,
      resultsLab: s.resultsLab,
      resultsImaging: s.resultsImaging,
      cumulativeCategories: (t.reports as any)?.cumulativeCategories,
      cumulativeSubgroups: (t.reports as any)?.cumulativeSubgroups,
      medicationTable: t.ipsExport?.tableLabels?.medication,
      vitalSigns: s.vitalSigns,
      medicalDevices: s.medicalDevices,
      planOfCare: s.planOfCare,
      advanceDirectives: s.advanceDirectives,
      noInformation: t.ipsExport?.noInformation,
    }
  }, [t])

  const curatedData = useMemo<ClinicalDataCollection | null>(() => {
    if (!curated) return null
    // Merge confirmed inferred problems into the Problem List. When the caller
    // passes none, this is the same object shape as before (empty spread).
    return extraConditions.length > 0
      ? { ...curated, conditions: [...curated.conditions, ...extraConditions] }
      : curated
  }, [curated, extraConditions])

  const bundle = useMemo<IpsBundle | null>(() => {
    if (!curatedData) return null
    return buildIpsBundle({ patient: patient ?? null, data: curatedData, labels })
  }, [curatedData, patient, labels])

  const validation = useMemo<ValidationResult | null>(
    () => (bundle ? validateIpsBundle(bundle) : null),
    [bundle],
  )

  // Total bundle entries minus Composition + Patient = clinical resources.
  const resourceCount = bundle ? Math.max(0, bundle.entry.length - 2) : 0

  return {
    bundle,
    curatedData,
    patient: patient ?? null,
    labels,
    validation,
    isLoading: dataLoading || patientLoading,
    error: (error as Error | null) ?? null,
    hasPatient: !!patient,
    resourceCount,
  }
}
