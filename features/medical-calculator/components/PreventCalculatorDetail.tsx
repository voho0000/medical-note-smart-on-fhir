'use client'
import { useEffect, useMemo } from 'react'
import { createFhirCdssPatientProfile } from '@voho0000/personalized-care-fhir'
import { usePatient } from '@/src/application/hooks/patient/use-patient-query.hook'
import { useClinicalData } from '@/src/application/hooks/clinical-data/use-clinical-data-query.hook'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useLabAutofill } from '../hooks/use-lab-autofill.hook'
import { usePreventInputs, usePreventInputsHydrated, usePreventInputsStore } from '../prevent-inputs.store'
import { buildPreventReading } from '../prevent-reading'
import { PreventCalculatorPanel } from './PreventCalculatorPanel'
export function PreventCalculatorDetail({ onBack, isFavorite, onToggleFavorite }: { onBack: () => void; isFavorite: boolean; onToggleFavorite: () => void }) {
  const { patient } = usePatient()
  const clinical = useClinicalData()
  const { autofill } = useLabAutofill()
  const { locale } = useLanguage()
  const patientId = patient?.id ?? 'prevent-calculator-scratch'
  const inputs = usePreventInputs(patientId)
  const ready = usePreventInputsHydrated(patientId)
  useEffect(() => { usePreventInputsStore.getState().hydrate(patientId) }, [patientId])
  const profile = useMemo(() => patient ? createFhirCdssPatientProfile({ patient, conditions: clinical.conditions, encounters: clinical.encounters, observations: clinical.observations, medications: clinical.medications, allergies: clinical.allergies, carePlans: clinical.carePlans }) : undefined, [patient, clinical.conditions, clinical.encounters, clinical.observations, clinical.medications, clinical.allergies, clinical.carePlans])
  const reading = useMemo(() => buildPreventReading({ profile, autofill, inputs }), [profile, autofill, inputs])
  return <div className="min-w-0"><div className="flex items-center justify-between gap-3 p-4"><button onClick={onBack} className="min-h-11 text-sm text-primary">← {locale === 'en' ? 'Calculators' : '醫療計算機'}</button><button onClick={onToggleFavorite} aria-pressed={isFavorite} className="min-h-11 text-sm">{isFavorite ? '★' : '☆'} {locale === 'en' ? 'Favorite' : '收藏'}</button></div><PreventCalculatorPanel reading={reading} locale={locale} ready={ready} onChange={patch => usePreventInputsStore.getState().setInputs(patientId, patch)} onReset={() => usePreventInputsStore.getState().clearInputs(patientId)} /></div>
}
