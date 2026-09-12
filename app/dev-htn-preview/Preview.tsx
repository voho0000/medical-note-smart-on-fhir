"use client"
import { useMemo, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LanguageProvider } from '@/src/application/providers/language.provider'
import { HYPERTENSION_GUIDELINE_PACK, type CdssPatientProfile } from '@voho0000/personalized-care'
import { ClinicalDecisionSupportView } from '@/features/clinical-decision-support/renderers/ClinicalDecisionSupportView'
import { applyClinicVitals } from '@/features/clinical-decision-support/utils/apply-clinic-vitals'
import { mergeClinicVitals, type ClinicVitals } from '@/features/clinical-decision-support/stores/clinic-vitals.store'
import { useEvidenceOverrides } from '@/features/clinical-decision-support/stores/evidence-overrides.store'
import { useLabAutofill } from '@/features/medical-calculator/hooks/use-lab-autofill.hook'
import { useCvdRiskResults } from '@/features/medical-calculator/cardiovascular-risk-results'
import { applyHypertensionRiskResults, clinicRiskContext } from '@/features/clinical-decision-support/utils/hypertension-risk-results'
import resistant from '@/__tests__/fixtures/htn/resistant-osa.profile.json'
import kidney from '@/__tests__/fixtures/htn/ckd-albuminuria.profile.json'
export default function Preview() {
 // The synthetic preview never reads a real chart from this browser session.
 const [client]=useState(()=>new QueryClient({defaultOptions:{queries:{enabled:false}}}))
 return <QueryClientProvider client={client}><LanguageProvider><PreviewContent /></LanguageProvider></QueryClientProvider>
}
function PreviewContent() {
 const [caseId,setCaseId]=useState('resistant-osa')
 const [vitals,setVitals]=useState<ClinicVitals>()
 const [english,setEnglish]=useState(false)
 const base=(caseId==='resistant-osa'?resistant:kidney) as CdssPatientProfile
 const overrides=useEvidenceOverrides(base.id)
 const {autofill}=useLabAutofill()
 const riskResults=useCvdRiskResults(base.id)
 const context=useMemo(()=>clinicRiskContext(vitals),[vitals])
 const profile=applyHypertensionRiskResults(applyClinicVitals({...base,evidenceOverrides:overrides},vitals),riskResults,autofill,context)
 const locale=english?'en':'zh-TW'
 const result=HYPERTENSION_GUIDELINE_PACK.build({profile,locale})
 return <main className="min-h-screen bg-background p-3 text-foreground"><div className="mx-auto max-w-5xl space-y-3">
 <header className="flex flex-wrap items-center gap-3 border-b pb-3"><h1 className="text-lg font-semibold">高血壓 CDSS · 合成病例預覽</h1><select aria-label="合成病例" className="min-h-11 rounded border bg-background p-2" value={caseId} onChange={e=>{setCaseId(e.target.value);setVitals(undefined)}}><option value="resistant-osa">抗藥性高血壓／OSA</option><option value="ckd-albuminuria">CKD／白蛋白尿</option></select><button className="min-h-11 p-2" onClick={()=>setEnglish(!english)}>中文 / English</button><button className="min-h-11 p-2" onClick={()=>document.documentElement.classList.toggle('dark')}>明／暗</button></header>
 <div className="@container" key={caseId}><ClinicalDecisionSupportView result={result} locale={locale} patientId={base.id} profileFacts={profile.facts} riskContext={context} clinicVitals={vitals} onSaveClinicVitals={patch=>setVitals(mergeClinicVitals(vitals,patch,new Date()))} onClearClinicVitals={()=>setVitals(undefined)} /></div>
 </div></main>
}
