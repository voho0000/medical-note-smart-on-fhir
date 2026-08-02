"use client"

import { useMemo } from 'react'
import { useClinicalData } from '@/src/application/hooks/clinical-data/use-clinical-data-query.hook'
import { usePatient } from '@/src/application/hooks/patient/use-patient-query.hook'
import { useAudience } from '@/src/application/providers/audience.provider'
import { calculateAge } from '@/src/core/entities/patient.entity'
import { buildPersonalizedEducation } from './engine'
import PersonalizedEducationFeature from './Feature'
import { createPatientEducationContext } from './patient-context'

function LoadingState() {
  return (
    <div
      className="mx-auto w-full max-w-3xl animate-pulse space-y-4 px-3 py-6 sm:px-5"
      aria-label="正在整理個人化衛教"
    >
      <div className="h-5 w-24 rounded bg-muted" />
      <div className="h-8 w-3/4 rounded bg-muted" />
      <div className="h-20 rounded bg-muted" />
      <div className="h-40 rounded bg-muted" />
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-3 py-8 sm:px-5">
      <div className="border border-destructive/40 bg-destructive/5 px-4 py-4">
        <h1 className="font-semibold text-foreground">目前無法整理衛教</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {message}
        </p>
      </div>
    </div>
  )
}

export default function LivePersonalizedEducationFeature() {
  const { patient, loading: patientLoading, error: patientError } = usePatient()
  const clinicalData = useClinicalData()
  const { audience } = useAudience()

  const result = useMemo(() => {
    if (!patient) return null

    return buildPersonalizedEducation(createPatientEducationContext({
      patient,
      conditions: clinicalData.conditions,
      encounters: clinicalData.encounters,
      observations: clinicalData.observations,
      medications: clinicalData.medications,
    }))
  }, [
    clinicalData.conditions,
    clinicalData.encounters,
    clinicalData.medications,
    clinicalData.observations,
    patient,
  ])

  // Only the first load shows the skeleton. `isFetching` also covers background
  // refetches, which would throw the reader back to a placeholder mid-sentence
  // while the content they were reading is still valid.
  if (patientLoading || clinicalData.isLoading) {
    return <LoadingState />
  }

  if (patientError || clinicalData.error) {
    return (
      <ErrorState
        message={
          patientError
          ?? clinicalData.error?.message
          ?? '讀取病歷時發生錯誤。'
        }
      />
    )
  }

  if (!patient) {
    return <ErrorState message="請先載入病人的病歷資料。" />
  }

  if (clinicalData.hasBlockingQueryIssues) {
    return (
      <ErrorState message="診斷、藥物、檢驗或就醫資料尚未完整載入，為避免錯配，這次不產生個人化衛教。" />
    )
  }

  return (
    <PersonalizedEducationFeature
      key={patient.id}
      plan={result?.plan ?? null}
      audience={audience}
      age={patient.age ?? calculateAge(patient.birthDate)}
    />
  )
}
