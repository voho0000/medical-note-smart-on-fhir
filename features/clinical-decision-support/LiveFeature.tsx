"use client"

import { useEffect, useMemo, useState } from 'react'
import { FileSearch, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useClinicalData } from '@/src/application/hooks/clinical-data/use-clinical-data-query.hook'
import { usePatient } from '@/src/application/hooks/patient/use-patient-query.hook'
import { useLanguage } from '@/src/application/providers/language.provider'
import { createFhirCdssPatientProfile } from '@voho0000/personalized-care-fhir'
import {
  getApplicableClinicalGuidelinePacks,
  getDefaultClinicalGuidelinePack,
  getEnabledClinicalGuidelinePacks,
} from './guideline-packs/registry'
import { ClinicalHandoffCard } from './renderers/ClinicalHandoffCard'
import { ClinicalDecisionSupportView } from './renderers/ClinicalDecisionSupportView'
import {
  useEvidenceOverrides,
  useEvidenceOverridesStore,
} from './stores/evidence-overrides.store'
import { useClinicVitals, useClinicVitalsStore } from './stores/clinic-vitals.store'
import { applyClinicVitals } from './utils/apply-clinic-vitals'
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
  applicablePackIds,
  selectedPackId,
  onSelect,
}: {
  locale: CdssLocale
  packs: readonly ClinicalGuidelinePack[]
  applicablePackIds: ReadonlySet<string>
  selectedPackId: string
  onSelect: (packId: string) => void
}) {
  const isEnglish = locale === 'en'
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-testid="cdss-disease-switch"
    >
      <span className="text-xs font-medium text-muted-foreground">
        {isEnglish
          ? `Disease (${applicablePackIds.size} applicable)`
          : `疾病（${applicablePackIds.size} 項適用）`}
      </span>
      <div
        className="inline-flex rounded-md border border-border bg-muted/30 p-0.5"
        role="group"
        aria-label={isEnglish ? 'Select disease guidance' : '選擇疾病指引'}
      >
        {packs.map((pack) => {
          const selected = pack.id === selectedPackId
          // Non-applicable pathways stay reachable but are dimmed, so the
          // clinician can see at a glance which ones this record activates
          // instead of clicking through every disease to find out.
          const applicable = applicablePackIds.has(pack.id)
          // A pack in this list that the package has not released is here
          // because the pilot gate let it through for this browser. Say so, so
          // a tester never mistakes it for generally available guidance.
          const pilot = !pack.enabled
          return (
            <button
              key={pack.id}
              type="button"
              className={[
                'inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors',
                selected
                  ? 'bg-background text-foreground shadow-sm'
                  : applicable
                    ? 'text-muted-foreground hover:text-foreground'
                    : 'text-muted-foreground/50 hover:text-muted-foreground',
              ].join(' ')}
              aria-pressed={selected}
              title={applicable
                ? undefined
                : isEnglish
                  ? 'This record does not activate the pathway'
                  : '本次資料未啟動此路徑'}
              data-testid={`cdss-disease-switch-${pack.id}`}
              data-applicable={applicable ? 'true' : 'false'}
              data-pilot={pilot ? 'true' : undefined}
              onClick={() => onSelect(pack.id)}
            >
              {pack.label[isEnglish ? 'en' : 'zh']}
              {pilot && (
                <span
                  className="rounded-sm bg-amber-500/15 px-1 py-px text-[0.9em] font-normal text-amber-700 dark:text-amber-400"
                  data-testid={`cdss-disease-switch-pilot-${pack.id}`}
                >
                  {isEnglish ? 'Pilot' : '試辦'}
                </span>
              )}
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
  const [requestedPackId, setRequestedPackId] = useState<string | null>(null)

  const patientId = patient?.id
  const evidenceOverrides = useEvidenceOverrides(patientId)
  const hydrateEvidenceOverrides = useEvidenceOverridesStore((state) => state.hydrate)
  const clinicVitals = useClinicVitals(patientId)
  const setClinicVitals = useClinicVitalsStore((state) => state.setVitals)
  const clearClinicVitals = useClinicVitalsStore((state) => state.clearVitals)

  // The switches this physician set on this chart survive a reload, so they are
  // read back before the pack runs rather than after.
  useEffect(() => {
    if (patientId) hydrateEvidenceOverrides(patientId)
  }, [hydrateEvidenceOverrides, patientId])

  // The chart half of the profile: expensive, and independent of the switches.
  const recordProfile = useMemo(() => {
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
      // Report narrative is structured evidence too: a chest film's conclusion
      // and a discharge summary's physical examination each state findings the
      // structured record does not otherwise carry.
      diagnosticReports: clinicalData.diagnosticReports,
      documentReferences: clinicalData.documentReferences,
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
    clinicalData.diagnosticReports,
    clinicalData.documentReferences,
    patient,
  ])

  // Toggling a row re-enters the pack through the profile, so a module's status
  // follows what the physician left standing. Nothing patches a rendered card.
  // The vitals measured in the room travel the same way: as facts on the
  // profile, so every module that reads them recomputes.
  const profile = useMemo(() => (
    recordProfile
      ? applyClinicVitals({ ...recordProfile, evidenceOverrides }, clinicVitals)
      : null
  ), [clinicVitals, evidenceOverrides, recordProfile])

  const applicablePacks = useMemo(() => (
    profile ? getApplicableClinicalGuidelinePacks(profile) : []
  ), [profile])
  const applicablePackIds = useMemo(
    () => new Set(applicablePacks.map((pack) => pack.id)),
    [applicablePacks],
  )

  // Opening on a pathway this record cannot activate made the clinician click
  // through every disease to find the ones that apply, so the first applicable
  // pack wins until a disease is chosen explicitly.
  const selectedPack = (requestedPackId
    ? guidelinePacks.find((pack) => pack.id === requestedPackId)
    : undefined)
    ?? applicablePacks[0]
    ?? getDefaultClinicalGuidelinePack()

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
    // Why a pathway did not activate is governed clinical language, so the pack
    // that owns the eligibility rule owns the wording too.
    const notApplicable = selectedPack.notApplicable(cdssLocale)
    return (
      <div className="@container mx-auto w-full max-w-[84rem] space-y-3 py-1">
        <DiseaseSwitcher
          locale={cdssLocale}
          packs={guidelinePacks}
          applicablePackIds={applicablePackIds}
          selectedPackId={selectedPack.id}
          onSelect={setRequestedPackId}
        />
        <StateMessage
          locale={cdssLocale}
          title={notApplicable.title}
          body={notApplicable.body}
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
            applicablePackIds={applicablePackIds}
            selectedPackId={selectedPack.id}
            onSelect={setRequestedPackId}
          />
          <div className="flex shrink-0 items-center gap-1.5">
            <Badge className="h-5 bg-rose-100 px-1.5 text-[11px] tabular-nums text-rose-800 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-200">
              {cdssLocale === 'en' ? `${highPriorityCount} priority` : `${highPriorityCount} 優先`}
            </Badge>
            <Badge className="h-5 bg-amber-100 px-1.5 text-[11px] tabular-nums text-amber-900 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-200">
              {cdssLocale === 'en' ? `${needsDataCount} need data` : `${needsDataCount} 需資料`}
            </Badge>
          </div>
        </div>
      </header>

      {result.clinicalHandoff ? (
        <ClinicalHandoffCard handoff={result.clinicalHandoff} />
      ) : null}
      <ClinicalDecisionSupportView
        result={result}
        locale={cdssLocale}
        patientId={patientId}
        clinicVitals={clinicVitals}
        onSaveClinicVitals={patientId ? (vitals) => setClinicVitals(patientId, vitals) : undefined}
        onClearClinicVitals={patientId ? () => clearClinicVitals(patientId) : undefined}
      />
    </div>
  )
}
