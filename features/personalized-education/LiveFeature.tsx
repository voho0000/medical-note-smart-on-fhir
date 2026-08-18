"use client"

import { useCallback, useMemo } from 'react'
import { RefreshCw } from 'lucide-react'
import { useClinicalData } from '@/src/application/hooks/clinical-data/use-clinical-data-query.hook'
import { usePatient } from '@/src/application/hooks/patient/use-patient-query.hook'
import { useAudience } from '@/src/application/providers/audience.provider'
import { useLanguage } from '@/src/application/providers/language.provider'
import { calculateAge } from '@/src/core/entities/patient.entity'
import { buildPersonalizedEducation } from './engine'
import PersonalizedEducationFeature from './Feature'
import { createPatientEducationContext } from './patient-context'

function LoadingState() {
  return (
    <div
      className="mx-auto w-full max-w-3xl animate-pulse space-y-4 py-6"
      aria-label="正在整理個人化衛教"
    >
      <div className="h-5 w-24 rounded bg-muted" />
      <div className="h-8 w-3/4 rounded bg-muted" />
      <div className="h-20 rounded bg-muted" />
      <div className="h-40 rounded bg-muted" />
    </div>
  )
}

/** Every branch here is recoverable — the plan is rebuilt from the clinical
 *  data, so re-running the underlying queries is the whole fix. Without the
 *  button the reader has to leave the tab and come back to try again. */
function ErrorState({ message, retryLabel, onRetry }: {
  message: string
  retryLabel: string
  onRetry: () => void
}) {
  return (
    <div className="mx-auto w-full max-w-3xl py-8">
      <div className="border border-destructive/40 bg-destructive/5 px-4 py-4">
        <h1 className="font-semibold text-foreground">目前無法整理衛教</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {message}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:min-h-8"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          {retryLabel}
        </button>
      </div>
    </div>
  )
}

export default function LivePersonalizedEducationFeature() {
  const { patient, loading: patientLoading, error: patientError, refetch: refetchPatient } = usePatient()
  const clinicalData = useClinicalData()
  const { audience } = useAudience()
  const { t } = useLanguage()

  // The clinical query is dependent on the patient query, so retry both: a
  // patient-level failure leaves the clinical query disabled, not merely failed.
  const refetchClinicalData = clinicalData.refetch
  const retry = useCallback(() => {
    void refetchPatient()
    void refetchClinicalData()
  }, [refetchClinicalData, refetchPatient])

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
        retryLabel={t.errors.retry}
        onRetry={retry}
      />
    )
  }

  if (!patient) {
    return (
      <ErrorState
        message="請先載入病人的病歷資料。"
        retryLabel={t.errors.retry}
        onRetry={retry}
      />
    )
  }

  if (clinicalData.hasBlockingQueryIssues) {
    return (
      <ErrorState
        message="診斷、藥物、檢驗或就醫資料尚未完整載入，為避免錯配，這次不產生個人化衛教。"
        retryLabel={t.errors.retry}
        onRetry={retry}
      />
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
