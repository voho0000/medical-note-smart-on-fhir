"use client"

import { useEffect, useState } from 'react'
import { CORONARY_DISEASE_GUIDELINE_PACK, HEART_FAILURE_GUIDELINE_PACK } from '@voho0000/personalized-care'
import { AscvdRiskCalculator } from '@/features/medical-calculator/components/AscvdRiskCalculator'
import { applyAscvdRiskReading } from '@/features/medical-calculator/ascvd-risk-profile'
import { useAscvdRiskInputs } from '@/features/medical-calculator/stores/ascvd-risk-inputs.store'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ClinicalDecisionSupportView } from '../renderers/ClinicalDecisionSupportView'
import { useClinicVitalsStore, useClinicVitals } from '../stores/clinic-vitals.store'
import { useEvidenceOverrides, useEvidenceOverridesStore } from '../stores/evidence-overrides.store'
import { usePhysicianDecisions, usePhysicianDecisionsStore } from '../stores/physician-decisions.store'
import { applyClinicVitals } from '../utils/apply-clinic-vitals'
import { coronaryPreviewProfile, type CoronaryPreviewScenario } from './coronary-preview-profile'

export function CoronaryPreview({ scenario, english = false, classic = false }: { scenario: CoronaryPreviewScenario; english?: boolean; classic?: boolean }) {
  const [now] = useState(() => new Date())
  const base = coronaryPreviewProfile(scenario, now)
  const patientId = base.id
  useEffect(() => {
    useClinicVitalsStore.getState().hydrate(patientId)
    usePhysicianDecisionsStore.getState().hydrate(patientId)
    useEvidenceOverridesStore.getState().hydrate(patientId)
  }, [patientId])
  const vitals = useClinicVitals(patientId)
  const evidenceOverrides = useEvidenceOverrides(patientId)
  const decisions = usePhysicianDecisions(patientId)
  const riskInputs = useAscvdRiskInputs(patientId)
  const beforeRisk = applyClinicVitals({ ...base, evidenceOverrides }, vitals)
  const profile = applyAscvdRiskReading(beforeRisk, riskInputs)
  const locale = english ? 'en' : 'zh-TW'
  const pack = scenario === 'hf' ? HEART_FAILURE_GUIDELINE_PACK : CORONARY_DISEASE_GUIDELINE_PACK
  const result = pack.build({ profile, locale })
  return <TooltipProvider><main className="mx-auto max-w-5xl px-3 py-4">
    <header className="mb-3 border-b border-border pb-3">
      <p className="text-xs text-muted-foreground">MediPrisma · 合成案例預覽</p>
      <h1 className="mt-1 text-lg font-semibold">{scenario === 'hf' ? 'HF CDSS' : '冠心病 CDSS'}</h1>
      <nav className="mt-2 flex flex-wrap gap-2 text-xs" aria-label="合成案例">
        {[['stable', '慢性期'], ['acs', 'ACS 後'], ['safety', '安全警訊'], ['missing', '資料缺漏'], ['empty', '無冠心病證據'], ['hf', 'HF 對照']].map(([key, label]) =>
          <a key={key} href={`?scenario=${key}${english ? '&lang=en' : ''}`} className="inline-flex min-h-11 items-center rounded-md border border-border px-2 text-primary">{label}</a>)}
        <button type="button" className="min-h-11 rounded-md border border-border px-2" onClick={() => document.documentElement.classList.toggle('dark')}>明暗切換</button>
        <a href={`?scenario=${scenario}${english ? '' : '&lang=en'}`} className="inline-flex min-h-11 items-center px-2 text-primary">{english ? '繁體中文' : 'English'}</a>
      </nav>
    </header>
    <div className="@container">
      <ClinicalDecisionSupportView result={result} locale={locale} patientId={patientId} profileFacts={profile.facts} layout={classic ? 'classic' : 'flow'}
        coronaryCalculator={<AscvdRiskCalculator profile={beforeRisk} isEnglish={english} />}
        clinicVitals={vitals} onSaveClinicVitals={patch => useClinicVitalsStore.getState().setVitals(patientId, patch)}
        onClearClinicVitals={() => useClinicVitalsStore.getState().clearVitals(patientId)} physicianDecisions={decisions}
        onRecordDecision={(id, input) => usePhysicianDecisionsStore.getState().recordDecision(patientId, id, input)}
        onClearDecision={id => usePhysicianDecisionsStore.getState().clearDecision(patientId, id)} />
    </div>
  </main></TooltipProvider>
}
