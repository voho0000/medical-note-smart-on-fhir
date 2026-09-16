'use client'
import { useState } from 'react'
import { HYPERLIPIDEMIA_GUIDELINE_PACK, type CdssPatientProfile } from '@voho0000/personalized-care'
import { NhiTable1Panel } from '@/features/clinical-decision-support/renderers/NhiTable1Panel'

const fact = (value: number | string, unit = '') => ({
  zh: `${value}${unit ? ' ' + unit : ''}`,
  en: `${value}${unit ? ' ' + unit : ''}`,
  ...(typeof value === 'number' ? { numericValue: value } : {}),
  date: '2026-08-30',
  sources: [{ resourceType: 'Observation' as const, resourceId: 'synthetic', date: '2026-08-30' }],
})

type Scenario = { label: string; facts: Record<string, ReturnType<typeof fact>> }

const SCENARIOS: Record<string, Scenario> = {
  'ascvd-code': {
    label: '只有 ASCVD 診斷碼（下限中風險）',
    facts: {
      ascvdDiagnosis: fact('動脈粥樣硬化心血管疾病：I25.10'),
      coronaryArteryDiagnosis: fact('冠狀動脈疾病：I25.10'),
      hypertensionDiagnosis: fact('高血壓：I10'),
      age: fact(68), LDL: fact(118, 'mg/dL'), HDL: fact(43, 'mg/dL'),
      nonHDL: fact(149, 'mg/dL'), totalCholesterol: fact(192, 'mg/dL'),
      triglycerides: fact(155, 'mg/dL'), eGFR: fact(66, 'mL/min/1.73m²'),
      bloodPressure: fact('132/78', 'mmHg'),
      statinTherapy: fact('目前用藥中：Atorvastatin 40 mg'),
    },
  },
  'prior-mi': {
    label: '同一人，病歷有心肌梗塞（非常高風險）',
    facts: {
      ascvdDiagnosis: fact('動脈粥樣硬化心血管疾病：I25.10'),
      myocardialInfarctionDiagnosis: fact('陳舊性心肌梗塞：I25.2'),
      hypertensionDiagnosis: fact('高血壓：I10'),
      age: fact(68), LDL: fact(118, 'mg/dL'), HDL: fact(43, 'mg/dL'),
      statinTherapy: fact('目前用藥中：Atorvastatin 40 mg'),
    },
  },
  'at-goal': {
    label: '已達標（六級目標都在值以上）',
    facts: {
      hypertensionDiagnosis: fact('高血壓：I10'), age: fact(68),
      LDL: fact(45, 'mg/dL'), HDL: fact(52, 'mg/dL'),
      statinTherapy: fact('目前用藥中：Rosuvastatin 10 mg'),
    },
  },
  'no-ldl': {
    label: '紀錄無 LDL-C',
    facts: { hypertensionDiagnosis: fact('高血壓：I10'), age: fact(68) },
  },
}

export default function Review() {
  const [scenario, setScenario] = useState<string>('ascvd-code')
  const [answers, setAnswers] = useState<Record<string, 'yes' | 'no' | 'unknown'>>({})
  const [english, setEnglish] = useState(false)

  const profile = {
    id: `synthetic-table1-${scenario}`,
    evaluatedAt: '2026-09-17T00:00:00+08:00',
    demographics: { sex: 'male' as const },
    eligibleDiseasePackIds: ['hyperlipidemia-poc'],
    facts: SCENARIOS[scenario].facts,
    nhiLipidReview: answers,
    medicationClassContexts: SCENARIOS[scenario].facts.statinTherapy
      ? {
          statin: {
            state: 'confirmed-current' as const,
            medicationNames: [SCENARIOS[scenario].facts.statinTherapy.zh.replace('目前用藥中：', '')],
            factKey: 'statinTherapy',
            // Six months back, so the 6–8 week rung has something to read.
            earliestObservedPrescriptionDate: '2026-03-04',
            dataWindowStartDate: '2025-09-01',
            lastPrescriptionDate: '2026-08-28',
            // A dose escalation the ladder can be read against.
            prescriptions: [
              { date: '2026-03-04', name: 'Atorvastatin 20 mg', dailyDose: 20, doseUnit: 'mg' },
              { date: '2026-04-02', name: 'Atorvastatin 20 mg', dailyDose: 20, doseUnit: 'mg' },
              { date: '2026-05-06', name: 'Atorvastatin 20 mg', dailyDose: 20, doseUnit: 'mg' },
              { date: '2026-06-03', name: 'Atorvastatin 40 mg', dailyDose: 40, doseUnit: 'mg' },
              { date: '2026-07-01', name: 'Atorvastatin 40 mg', dailyDose: 40, doseUnit: 'mg' },
              { date: '2026-08-28', name: 'Atorvastatin 40 mg', dailyDose: 40, doseUnit: 'mg' },
            ],
          },
        }
      : {},
  } as unknown as CdssPatientProfile

  const locale = english ? 'en' : 'zh-TW'
  const card = HYPERLIPIDEMIA_GUIDELINE_PACK.build({ profile, locale })
    .recommendations.find(item => item.id === 'dyslipidemia-risk-and-target')
  const summary = card?.coverageSummary

  return (
    <main className="mx-auto max-w-[80rem] p-3">
      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border p-3">
        <strong className="text-sm">合成案例 · 健保表一判級</strong>
        <select
          aria-label="案例"
          value={scenario}
          onChange={event => { setScenario(event.target.value); setAnswers({}) }}
          className="min-h-11 rounded border bg-background p-2 text-sm"
        >
          {Object.entries(SCENARIOS).map(([id, item]) => (
            <option key={id} value={id}>{item.label}</option>
          ))}
        </select>
        <button type="button" className="min-h-11 text-sm underline" onClick={() => setAnswers({})}>清除醫師回答</button>
        <button type="button" className="min-h-11 text-sm underline" onClick={() => setEnglish(!english)}>中文 / English</button>
        <button type="button" className="min-h-11 text-sm underline" onClick={() => document.documentElement.classList.toggle('dark')}>明 / 暗</button>
      </div>
      <div className="@container rounded-lg border bg-card py-3">
        {summary ? (
          <NhiTable1Panel
            summary={summary}
            locale={locale}
            onAnswer={(id, state) => setAnswers(current => {
              const next = { ...current }
              if (state === undefined) delete next[id]
              else next[id] = state
              return next
            })}
          />
        ) : (
          <p className="px-3 text-sm text-muted-foreground">本案例沒有健保分層卡。</p>
        )}
      </div>
    </main>
  )
}
