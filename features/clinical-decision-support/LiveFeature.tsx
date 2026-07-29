"use client"

import { useMemo } from 'react'
import { FileSearch, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useClinicalData } from '@/src/application/hooks/clinical-data/use-clinical-data-query.hook'
import { usePatient } from '@/src/application/hooks/patient/use-patient-query.hook'
import { useLanguage } from '@/src/application/providers/language.provider'
import { createFhirCdssPatientProfile } from './adapters/fhir-cdss-profile'
import { getDefaultClinicalGuidelinePack } from './guideline-packs/registry'
import { ClinicalDecisionSupportView } from './renderers/ClinicalDecisionSupportView'
import type { CdssLocale } from './types'

function LoadingState({ locale }: { locale: CdssLocale }) {
  return (
    <div
      className="@container mx-auto w-full max-w-[84rem] animate-pulse space-y-3 py-1"
      aria-label={locale === 'en' ? 'Building clinical decision support' : '正在整理臨床決策支援'}
    >
      <div className="h-5 w-32 rounded bg-muted" />
      <div className="h-8 w-2/3 rounded bg-muted" />
      <div className="h-24 rounded-lg border border-border bg-muted/20" />
      <div className="h-36 rounded-lg border border-border bg-muted/20" />
    </div>
  )
}

function StateMessage({
  locale,
  title,
  body,
}: {
  locale: CdssLocale
  title: string
  body: string
}) {
  return (
    <section
      className="@container mx-auto w-full max-w-[84rem] rounded-lg border border-border bg-background p-4"
      role="status"
      data-testid="clinical-decision-support-state"
    >
      <div className="flex gap-3">
        <FileSearch className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div>
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
          <p className="mt-2 flex items-center gap-1.5 text-xs leading-relaxed text-muted-foreground">
            <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
            {locale === 'en'
              ? 'Missing data is treated as unknown, never as a negative finding.'
              : '缺少資料一律視為未知，不會轉成陰性結果。'}
          </p>
        </div>
      </div>
    </section>
  )
}

export default function LiveClinicalDecisionSupportFeature() {
  const { patient, loading: patientLoading, error: patientError } = usePatient()
  const clinicalData = useClinicalData()
  const { locale } = useLanguage()
  const cdssLocale: CdssLocale = locale === 'en' ? 'en' : 'zh-TW'

  const profile = useMemo(() => {
    if (!patient) return null
    return createFhirCdssPatientProfile({
      patient,
      conditions: clinicalData.conditions,
      encounters: clinicalData.encounters,
      observations: clinicalData.observations,
      medications: clinicalData.medications,
      allergies: clinicalData.allergies,
      carePlans: clinicalData.carePlans,
      procedures: clinicalData.procedures,
      immunizations: clinicalData.immunizations,
    })
  }, [
    clinicalData.conditions,
    clinicalData.encounters,
    clinicalData.medications,
    clinicalData.allergies,
    clinicalData.observations,
    clinicalData.carePlans,
    clinicalData.procedures,
    clinicalData.immunizations,
    patient,
  ])

  const result = useMemo(() => {
    if (!profile) return null
    const pack = getDefaultClinicalGuidelinePack()
    return pack.applies(profile) ? pack.build({ profile, locale: cdssLocale }) : null
  }, [cdssLocale, profile])

  if (patientLoading || clinicalData.isLoading || clinicalData.isFetching) {
    return <LoadingState locale={cdssLocale} />
  }

  if (patientError || clinicalData.error) {
    return (
      <StateMessage
        locale={cdssLocale}
        title={cdssLocale === 'en' ? 'Clinical data could not be loaded' : '目前無法載入臨床資料'}
        body={patientError ?? clinicalData.error?.message ?? (
          cdssLocale === 'en' ? 'Try loading the patient record again.' : '請重新載入病人病歷後再試。'
        )}
      />
    )
  }

  if (!patient) {
    return (
      <StateMessage
        locale={cdssLocale}
        title={cdssLocale === 'en' ? 'No patient record is loaded' : '尚未載入病人病歷'}
        body={cdssLocale === 'en'
          ? 'Load the patient record before running diabetes decision support.'
          : '請先載入病人資料，再執行糖尿病決策支援。'}
      />
    )
  }

  if (clinicalData.hasBlockingQueryIssues) {
    return (
      <StateMessage
        locale={cdssLocale}
        title={cdssLocale === 'en' ? 'Required patient data are incomplete' : '必要的病人資料尚未完整'}
        body={cdssLocale === 'en'
          ? 'Diagnosis, medication, laboratory, or encounter data did not load completely. No patient-specific recommendation was generated.'
          : '診斷、藥物、檢驗或就醫資料未完整載入；為避免錯配，本次不產生個人化建議。'}
      />
    )
  }

  if (!profile || !result) {
    return (
      <StateMessage
        locale={cdssLocale}
        title={cdssLocale === 'en' ? 'Diabetes pathway not activated' : '本次未啟動糖尿病決策路徑'}
        body={cdssLocale === 'en'
          ? 'This data slice does not contain a governed type 2 diabetes diagnosis or a validated HbA1c result in the diagnostic range. This does not prove that diabetes is absent.'
          : '本次資料切片沒有可治理的第二型糖尿病診斷，也沒有單位已驗證且落在診斷範圍的 HbA1c；這不代表病人沒有糖尿病。'}
      />
    )
  }

  const highPriorityCount = result.recommendations.filter((item) => item.priority === 'high').length
  const needsDataCount = result.recommendations.filter((item) => item.status === 'needs-data').length

  return (
    <div
      className="@container mx-auto w-full max-w-[84rem] space-y-3 py-1"
      data-testid="live-clinical-decision-support"
    >
      <header
        className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border pb-2"
        title={cdssLocale === 'en'
          ? `Clinical rules ${result.packVersion}`
          : `臨床規則版本 ${result.packVersion}`}
      >
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate text-lg font-semibold tracking-tight text-foreground">
            {result.title}
          </h2>
          <Badge variant="outline" className="h-5 shrink-0 px-1.5 text-[11px]">
            {cdssLocale === 'en' ? 'Read only' : '唯讀建議'}
          </Badge>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <Badge className="h-5 bg-rose-100 px-1.5 text-[11px] text-rose-800 hover:bg-rose-100 dark:bg-rose-950 dark:text-rose-200">
            {cdssLocale === 'en' ? `${highPriorityCount} priority` : `${highPriorityCount} 優先`}
          </Badge>
          <Badge className="h-5 bg-amber-100 px-1.5 text-[11px] text-amber-900 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-200">
            {cdssLocale === 'en' ? `${needsDataCount} need data` : `${needsDataCount} 需資料`}
          </Badge>
        </div>
      </header>

      <ClinicalDecisionSupportView result={result} locale={cdssLocale} />
    </div>
  )
}
