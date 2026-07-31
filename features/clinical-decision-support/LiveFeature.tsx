"use client"

import { useMemo, useState } from 'react'
import { FileSearch, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useClinicalData } from '@/src/application/hooks/clinical-data/use-clinical-data-query.hook'
import { usePatient } from '@/src/application/hooks/patient/use-patient-query.hook'
import { useLanguage } from '@/src/application/providers/language.provider'
import { createFhirCdssPatientProfile } from './adapters/fhir-cdss-profile'
import {
  getDefaultClinicalGuidelinePack,
  getEnabledClinicalGuidelinePacks,
} from './guideline-packs/registry'
import { ClinicalHandoffCard } from './renderers/ClinicalHandoffCard'
import { ClinicalDecisionSupportView } from './renderers/ClinicalDecisionSupportView'
import type { CdssLocale, ClinicalGuidelinePack } from './types'

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

function DiseaseSwitcher({
  locale,
  packs,
  selectedPackId,
  onSelect,
}: {
  locale: CdssLocale
  packs: readonly ClinicalGuidelinePack[]
  selectedPackId: string
  onSelect: (packId: string) => void
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-testid="cdss-disease-switch"
    >
      <span className="text-xs font-medium text-muted-foreground">
        {locale === 'en' ? 'Disease' : '疾病'}
      </span>
      <div
        className="inline-flex rounded-md border border-border bg-muted/30 p-0.5"
        role="group"
        aria-label={locale === 'en' ? 'Select disease guidance' : '選擇疾病指引'}
      >
        {packs.map((pack) => {
          const selected = pack.id === selectedPackId
          return (
            <button
              key={pack.id}
              type="button"
              className={[
                'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                selected
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              ].join(' ')}
              aria-pressed={selected}
              data-testid={`cdss-disease-switch-${pack.id}`}
              onClick={() => onSelect(pack.id)}
            >
              {pack.label[locale === 'en' ? 'en' : 'zh']}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function LiveClinicalDecisionSupportFeature() {
  const { patient, loading: patientLoading, error: patientError } = usePatient()
  const clinicalData = useClinicalData()
  const { locale } = useLanguage()
  const cdssLocale: CdssLocale = locale === 'en' ? 'en' : 'zh-TW'
  const guidelinePacks = useMemo(() => getEnabledClinicalGuidelinePacks(), [])
  const [selectedPackId, setSelectedPackId] = useState(
    getDefaultClinicalGuidelinePack().id,
  )
  const selectedPack = guidelinePacks.find((pack) => pack.id === selectedPackId)
    ?? getDefaultClinicalGuidelinePack()

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
    return selectedPack.applies(profile)
      ? selectedPack.build({ profile, locale: cdssLocale })
      : null
  }, [cdssLocale, profile, selectedPack])

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
          ? 'Load the patient record before running personalized disease guidance.'
          : '請先載入病人資料，再執行個人化疾病指引。'}
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
    const isCkd = selectedPack.diseaseCode === 'CKD'
    const isHypertension = selectedPack.diseaseCode === 'HTN'
    const isHyperlipidemia = selectedPack.diseaseCode === 'LIPID'
    const isHeartFailure = selectedPack.diseaseCode === 'HF'
    const isCirrhosis = selectedPack.diseaseCode === 'CIRRHOSIS'
    const isAki = selectedPack.diseaseCode === 'AKI'
    const isRenalSafety = selectedPack.diseaseCode === 'RENAL-SAFETY'
    const isAtrialFibrillation = selectedPack.diseaseCode === 'AF'
    const isCkdAnemia = selectedPack.diseaseCode === 'CKD-ANEMIA'
    return (
      <div className="@container mx-auto w-full max-w-[84rem] space-y-3 py-1">
        <DiseaseSwitcher
          locale={cdssLocale}
          packs={guidelinePacks}
          selectedPackId={selectedPack.id}
          onSelect={setSelectedPackId}
        />
        <StateMessage
          locale={cdssLocale}
          title={isCkd
            ? cdssLocale === 'en'
              ? 'Chronic kidney disease pathway not activated'
              : '本次未啟動慢性腎臟病決策路徑'
            : isHypertension
              ? cdssLocale === 'en'
                ? 'Hypertension pathway not activated'
                : '本次未啟動高血壓決策路徑'
              : isHyperlipidemia
                ? cdssLocale === 'en'
                  ? 'Dyslipidemia pathway not activated'
                  : '本次未啟動高血脂決策路徑'
                : isHeartFailure
                  ? cdssLocale === 'en'
                    ? 'Heart-failure pathway not activated'
                    : '本次未啟動心衰竭決策路徑'
                  : isCirrhosis
                    ? cdssLocale === 'en'
                      ? 'Cirrhosis pathway not activated'
                      : '本次未啟動肝硬化決策路徑'
                : isAki
                  ? cdssLocale === 'en'
                    ? 'AKI alert pathway not activated'
                    : '本次未啟動 AKI 警示路徑'
                  : isRenalSafety
                    ? cdssLocale === 'en'
                      ? 'Potassium/kidney safety pathway not activated'
                      : '本次未啟動血鉀／腎功能安全路徑'
                    : isAtrialFibrillation
                      ? cdssLocale === 'en'
                        ? 'AF anticoagulation pathway not activated'
                        : '本次未啟動 AF 抗凝路徑'
                      : isCkdAnemia
                        ? cdssLocale === 'en'
                          ? 'CKD anemia pathway not activated'
                          : '本次未啟動 CKD 貧血路徑'
                : cdssLocale === 'en'
                  ? 'Diabetes pathway not activated'
                  : '本次未啟動糖尿病決策路徑'}
          body={isCkd
            ? cdssLocale === 'en'
              ? 'This data slice does not contain a governed N18 diagnosis, an active CKD care plan, or repeated eGFR values below 60 separated by at least 3 months. This does not prove that CKD is absent.'
              : '本次資料切片沒有可治理的 N18 診斷、進行中的 CKD 照護計畫，也沒有相隔至少 3 個月的兩次 eGFR <60；這不代表病人沒有慢性腎臟病。'
            : isHypertension
              ? cdssLocale === 'en'
                ? 'This data slice does not contain a governed I10-I13 or I15 hypertension diagnosis. A BP value alone does not activate or exclude the diagnosis.'
                : '本次資料切片沒有可治理的 I10–I13 或 I15 高血壓診斷；單筆血壓不會用來啟動或排除診斷。'
              : isHyperlipidemia
                ? cdssLocale === 'en'
                  ? 'This data slice does not contain a governed E78 diagnosis, LDL-C ≥190 mg/dL, or triglycerides ≥500 mg/dL. This does not prove that dyslipidemia is absent.'
                  : '本次資料切片沒有可治理的 E78 血脂異常診斷、LDL-C ≥190 mg/dL 或三酸甘油酯 ≥500 mg/dL；這不代表病人沒有血脂異常。'
                : isHeartFailure
                  ? cdssLocale === 'en'
                    ? 'This data slice does not contain a governed I50, I11.0, I13.0, or I13.2 heart-failure diagnosis. LVEF or BNP alone does not activate or exclude the diagnosis.'
                    : '本次資料切片沒有可治理的 I50、I11.0、I13.0 或 I13.2 心衰竭診斷；LVEF 或 BNP 單獨不會用來啟動或排除診斷。'
                  : isCirrhosis
                    ? cdssLocale === 'en'
                      ? 'This data slice does not contain a governed K70.3, K71.7, or K74.3-K74.6 cirrhosis diagnosis. Abnormal liver tests alone do not activate or exclude cirrhosis.'
                      : '本次資料切片沒有可治理的 K70.3、K71.7 或 K74.3–K74.6 肝硬化診斷；肝功能異常不會單獨啟動或排除肝硬化。'
                : isAki
                  ? cdssLocale === 'en'
                    ? 'This data slice does not contain a governed serum creatinine result. This does not prove that AKI is absent; use real-time institutional data when AKI is suspected.'
                    : '本次資料切片沒有可治理的血清 creatinine；這不代表病人沒有 AKI，臨床懷疑時應以院內即時資料評估。'
                  : isRenalSafety
                    ? cdssLocale === 'en'
                      ? 'This data slice does not contain governed potassium, eGFR, serum creatinine, or CKD data. This does not establish kidney or electrolyte safety.'
                      : '本次資料切片沒有可治理的血鉀、eGFR、血清 creatinine 或 CKD 資料；這不代表腎功能或電解質安全。'
                    : isAtrialFibrillation
                      ? cdssLocale === 'en'
                        ? 'This data slice does not contain a governed I48 atrial-fibrillation/flutter diagnosis. Medication records alone do not activate or exclude AF.'
                        : '本次資料切片沒有可治理的 I48 心房顫動／撲動診斷；用藥紀錄不會單獨啟動或排除 AF。'
                      : isCkdAnemia
                        ? cdssLocale === 'en'
                          ? 'The CKD anemia pathway requires governed CKD eligibility. An abnormal hemoglobin alone does not establish CKD anemia.'
                          : 'CKD 貧血路徑需要可治理的 CKD 適用條件；單一 Hb 異常不會被歸因為 CKD anemia。'
                : cdssLocale === 'en'
                  ? 'This data slice does not contain a governed type 2 diabetes diagnosis or a validated HbA1c result in the diagnostic range. This does not prove that diabetes is absent.'
                  : '本次資料切片沒有可治理的第二型糖尿病診斷，也沒有單位已驗證且落在診斷範圍的 HbA1c；這不代表病人沒有糖尿病。'}
        />
      </div>
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
        <div className="flex min-w-0 flex-1 items-center">
          <h2 className="truncate text-lg font-semibold tracking-tight text-foreground">
            {result.title}
          </h2>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-3">
          <DiseaseSwitcher
            locale={cdssLocale}
            packs={guidelinePacks}
            selectedPackId={selectedPack.id}
            onSelect={setSelectedPackId}
          />
          <div className="flex shrink-0 items-center gap-1.5">
            <Badge className="h-5 bg-rose-100 px-1.5 text-[11px] tabular-nums text-rose-800 hover:bg-rose-100 dark:bg-rose-950 dark:text-rose-200">
              {cdssLocale === 'en' ? `${highPriorityCount} priority` : `${highPriorityCount} 優先`}
            </Badge>
            <Badge className="h-5 bg-amber-100 px-1.5 text-[11px] tabular-nums text-amber-900 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-200">
              {cdssLocale === 'en' ? `${needsDataCount} need data` : `${needsDataCount} 需資料`}
            </Badge>
          </div>
        </div>
      </header>

      {result.clinicalHandoff ? (
        <ClinicalHandoffCard handoff={result.clinicalHandoff} />
      ) : null}
      <ClinicalDecisionSupportView result={result} locale={cdssLocale} />
    </div>
  )
}
