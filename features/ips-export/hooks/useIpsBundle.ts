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

export interface UseIpsBundleResult {
  bundle: IpsBundle | null
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
 */
export function useIpsBundle(): UseIpsBundleResult {
  const { t } = useLanguage()
  const { data, isLoading: dataLoading, error } = useClinicalDataQuery()
  const { data: patient, isLoading: patientLoading } = usePatientQuery()
  const { selectedData, filters } = useDataSelection()

  // Curate the full collection down to the user's 資料選擇 (data-selection)
  // choices so the IPS is a coherent snapshot, not a multi-year data dump.
  const curated = useMemo(
    () => (data ? curateForIps({ data, selection: selectedData, filters }) : null),
    [data, selectedData, filters],
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
      vitalSigns: s.vitalSigns,
      medicalDevices: s.medicalDevices,
      planOfCare: s.planOfCare,
      advanceDirectives: s.advanceDirectives,
      noInformation: t.ipsExport?.noInformation,
    }
  }, [t])

  const bundle = useMemo<IpsBundle | null>(() => {
    if (!curated) return null
    return buildIpsBundle({ patient: patient ?? null, data: curated, labels })
  }, [curated, patient, labels])

  const validation = useMemo<ValidationResult | null>(
    () => (bundle ? validateIpsBundle(bundle) : null),
    [bundle],
  )

  // Total bundle entries minus Composition + Patient = clinical resources.
  const resourceCount = bundle ? Math.max(0, bundle.entry.length - 2) : 0

  return {
    bundle,
    validation,
    isLoading: dataLoading || patientLoading,
    error: (error as Error | null) ?? null,
    hasPatient: !!patient,
    resourceCount,
  }
}
