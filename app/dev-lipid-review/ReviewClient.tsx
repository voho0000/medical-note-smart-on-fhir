'use client'
import { usePreventInputs, usePreventInputsStore, usePreventInputsHydrated } from '@/features/medical-calculator/prevent-inputs.store'
import { buildPreventReading } from '@/features/medical-calculator/prevent-reading'
import { PreventCalculatorPanel } from '@/features/medical-calculator/components/PreventCalculatorPanel'
import { applyPreventReading } from '@/features/clinical-decision-support/utils/prevent-result'
import { useEffect, useState } from 'react'
import { HYPERLIPIDEMIA_GUIDELINE_PACK, HEART_FAILURE_GUIDELINE_PACK, type CdssPatientProfile } from '@voho0000/personalized-care'
import { ClinicalDecisionSupportView } from '@/features/clinical-decision-support/renderers/ClinicalDecisionSupportView'
import { useEvidenceOverrides } from '@/features/clinical-decision-support/stores/evidence-overrides.store'
import { usePhysicianDecisions, usePhysicianDecisionsStore } from '@/features/clinical-decision-support/stores/physician-decisions.store'
// Synthetic display profiles; adapter and raw FHIR behavior are covered by core fixtures.
const fact = (n: number | string, unit = '') => ({ zh: `${n}${unit ? ' '+unit : ''}`, en: `${n}${unit ? ' '+unit : ''}`, ...(typeof n === 'number' ? { numericValue: n } : {}), date: '2026-09-05', sources: [{ resourceType: 'Observation' as const, resourceId: 'synthetic-'+n, date: '2026-09-05' }] })
export default function Review() {
 const [scenario, setScenario] = useState('ascvd')
 const [showCalculator, setShowCalculator] = useState(false)
 const [english, setEnglish] = useState(false)
 const id = 'synthetic-lipid-review-'+scenario
 const preventInputs = usePreventInputs(id)
 const preventReady = usePreventInputsHydrated(id)
 useEffect(() => { usePreventInputsStore.getState().hydrate(id) }, [id])
 const evidenceOverrides = useEvidenceOverrides(id)
 const decisions = usePhysicianDecisions(id)
 useEffect(() => { usePhysicianDecisionsStore.getState().hydrate(id) }, [id])
 const profile: CdssPatientProfile = {
  id, evaluatedAt: '2026-09-12T00:00:00Z', eligibleDiseasePackIds: ['hyperlipidemia-poc'], evidenceOverrides,
  facts: scenario === 'missing' ? {} : scenario === 'primary' ? { age: fact(50), LDL: fact(130, 'mg/dL'), totalCholesterol: fact(240, 'mg/dL'), HDL: fact(55, 'mg/dL'), eGFR: fact(90), bodyMassIndex: fact(35) } : {
   ascvdDiagnosis: fact('已記載冠狀動脈疾病'), myocardialInfarctionDiagnosis: fact('既往 MI'), hypertensionDiagnosis: fact('高血壓'), age: fact(68),
   LDL: fact(scenario === 'goal' ? 45 : 118, 'mg/dL'), nonHDL: fact(scenario === 'goal' ? 70 : 149, 'mg/dL'), HDL: fact(43, 'mg/dL'), totalCholesterol: fact(192, 'mg/dL'), triglycerides: fact(scenario === 'tg' ? 1200 : 155, 'mg/dL'),
   eGFR: fact(66, 'mL/min/1.73m²'), HbA1c: fact(5.8, '%'), bloodPressure: fact('132/78', 'mmHg'),
   medicationListOverview: fact('Atorvastatin 40 mg'), statinTherapy: fact('目前用藥中：Atorvastatin 40 mg'), ezetimibeTherapy: fact('未見處方'), pcsk9Therapy: fact('未見處方'),
  },
  medicationClassContexts: scenario === 'primary' ? {} : { statin: { state: 'confirmed-current', medicationNames: ['Atorvastatin 40 mg'], factKey: 'statinTherapy' } }
 }
 const reading = buildPreventReading({ profile, inputs: preventInputs })
 const calculator = <PreventCalculatorPanel reading={reading} ready={preventReady} locale={english ? 'en' : 'zh-TW'} onChange={patch => usePreventInputsStore.getState().setInputs(id, patch)} onReset={() => usePreventInputsStore.getState().clearInputs(id)} />
 const result = (scenario === 'hf' ? HEART_FAILURE_GUIDELINE_PACK : HYPERLIPIDEMIA_GUIDELINE_PACK).build({ profile: applyPreventReading(profile, reading), locale: english ? 'en' : 'zh-TW' })
 return <main className="mx-auto max-w-4xl p-3"><div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border p-3"><strong>合成案例 · 高血脂審閱</strong><select aria-label="案例" value={scenario} onChange={e=>setScenario(e.target.value)} className="min-h-11 rounded border bg-background p-2"><option value="ascvd">ASCVD 未達標</option><option value="goal">已達標</option><option value="tg">嚴重 TG</option><option value="primary">初級預防 PREVENT</option><option value="missing">缺資料</option><option value="hf">HF 基準</option></select><button className="min-h-11" onClick={()=>setShowCalculator(!showCalculator)}>{showCalculator ? '回 CDSS' : '檢視共用計算機'}</button>{scenario === 'primary' ? <button className="min-h-11" onClick={()=>usePreventInputsStore.getState().setInputs(id, Object.fromEntries(Object.entries({ age: '50', sex: 'female', tc: '240', hdl: '55', sbp: '160', bmi: '35', egfr: '90', dm: 'no', smoking: 'no', bpTx: 'yes', statin: 'no', cvd: 'no' }).map(([key,value])=>[key,{value}])))}>載入論文計算範例</button> : null}<button className="min-h-11" onClick={()=>setEnglish(!english)}>中文 / English</button><button className="min-h-11" onClick={()=>document.documentElement.classList.toggle('dark')}>明 / 暗</button></div><div className="@container">{showCalculator ? calculator : <ClinicalDecisionSupportView preventCalculator={calculator} key={id} result={result} locale={english ? 'en' : 'zh-TW'} patientId={id} profileFacts={profile.facts} physicianDecisions={decisions} onRecordDecision={(module,input)=>usePhysicianDecisionsStore.getState().recordDecision(id,module,input)} onClearDecision={module=>usePhysicianDecisionsStore.getState().clearDecision(id,module)} />}</div></main>
}
