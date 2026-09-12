"use client"

import { useEffect, useMemo } from 'react'
import { createFhirCdssPatientProfile } from '@voho0000/personalized-care-fhir'
import { usePatient } from '@/src/application/hooks/patient/use-patient-query.hook'
import { useClinicalData } from '@/src/application/hooks/clinical-data/use-clinical-data-query.hook'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useEvidenceOverrides, useEvidenceOverridesStore } from '@/features/clinical-decision-support/stores/evidence-overrides.store'
import { AscvdRiskCalculator } from './AscvdRiskCalculator'

export function ConnectedAscvdRiskCalculator() {
  const { patient } = usePatient()
  const data = useClinicalData()
  const { locale } = useLanguage()
  const overrides = useEvidenceOverrides(patient?.id)
  useEffect(() => { if (patient?.id) useEvidenceOverridesStore.getState().hydrate(patient.id) }, [patient?.id])
  const profile = useMemo(() => patient ? createFhirCdssPatientProfile({
    patient, conditions: data.conditions, encounters: data.encounters,
    observations: data.observations, medications: data.medications, allergies: data.allergies,
    carePlans: data.carePlans, procedures: data.procedures, immunizations: data.immunizations,
    diagnosticReports: data.diagnosticReports, documentReferences: data.documentReferences,
  }) : null, [patient, data.conditions, data.encounters, data.observations, data.medications, data.allergies, data.carePlans, data.procedures, data.immunizations, data.diagnosticReports, data.documentReferences])
  if (!profile) return <p className="p-3 text-sm text-muted-foreground">{locale === 'en' ? 'Select a patient to complete this calculator.' : '請先選取病人，再完成此計算機。'}</p>
  return <AscvdRiskCalculator profile={{ ...profile, evidenceOverrides: overrides }} isEnglish={locale === 'en'} />
}
