'use client'
import { useState } from 'react'
import { HYPERLIPIDEMIA_GUIDELINE_PACK, type CdssPatientProfile } from '@voho0000/personalized-care'
import { NhiTable1Panel } from '@/features/clinical-decision-support/renderers/NhiTable1Panel'
import type { NhiLipidAiSuggestion } from '@/features/clinical-decision-support/ai/nhi-lipid-ai-assist'
import type { NhiLipidAiAssist } from '@/features/clinical-decision-support/hooks/use-nhi-lipid-ai-assist.hook'
import type {
  NhiLipidAnswerProvenance,
  NhiLipidAnswerProvenanceById,
} from '@/features/clinical-decision-support/stores/nhi-lipid-review.store'

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
  const [aiSuggestions, setAiSuggestions] = useState<Record<string, NhiLipidAiSuggestion>>({})
  const [aiDecisions, setAiDecisions] = useState<NhiLipidAiAssist['decisions']>({})
  const [answerProvenance, setAnswerProvenance] = useState<NhiLipidAnswerProvenanceById>({})

  const profile = {
    id: `synthetic-table1-${scenario}`,
    evaluatedAt: '2026-09-17T00:00:00+08:00',
    demographics: { sex: 'male' as const },
    eligibleDiseasePackIds: ['hyperlipidemia-poc'],
    facts: SCENARIOS[scenario].facts,
    nhiLipidReview: answers,
    labSeries: SCENARIOS[scenario].facts.LDL
      ? {
          LDL: [
            { date: '2026-08-30', numericValue: Number(SCENARIOS[scenario].facts.LDL.numericValue), unit: 'mg/dL', displayValue: `${SCENARIOS[scenario].facts.LDL.numericValue} mg/dL` },
            { date: '2026-05-18', numericValue: 132, unit: 'mg/dL', displayValue: '132 mg/dL' },
            { date: '2026-02-20', numericValue: 158, unit: 'mg/dL', displayValue: '158 mg/dL' },
            { date: '2025-11-08', numericValue: 171, unit: 'mg/dL', displayValue: '171 mg/dL' },
          ],
        }
      : undefined,
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
              { date: '2026-03-04', name: 'Atorvastatin 20 mg', ingredient: 'atorvastatin', dailyDose: 20, doseUnit: 'mg' },
              { date: '2026-04-02', name: 'Atorvastatin 20 mg', ingredient: 'atorvastatin', dailyDose: 20, doseUnit: 'mg' },
              { date: '2026-05-06', name: 'Atorvastatin 20 mg', ingredient: 'atorvastatin', dailyDose: 20, doseUnit: 'mg' },
              { date: '2026-06-03', name: 'Atorvastatin 40 mg', ingredient: 'atorvastatin', dailyDose: 40, doseUnit: 'mg' },
              { date: '2026-07-01', name: 'Atorvastatin 40 mg', ingredient: 'atorvastatin', dailyDose: 40, doseUnit: 'mg' },
              { date: '2026-08-28', name: 'Atorvastatin 40 mg', ingredient: 'atorvastatin', dailyDose: 40, doseUnit: 'mg' },
            ],
          },
        }
      : {},
  } as unknown as CdssPatientProfile

  const withAdjunct = SCENARIOS[scenario].facts.statinTherapy
    ? {
        ...profile,
        medicationClassContexts: {
          ...profile.medicationClassContexts,
          ezetimibe: {
            state: 'confirmed-current' as const,
            medicationNames: ['Ezetimibe 10 mg'],
            factKey: 'ezetimibeTherapy',
            prescriptions: [
              { date: '2026-07-01', name: 'Ezetimibe 10 mg', ingredient: 'ezetimibe', dailyDose: 10, doseUnit: 'mg' },
              { date: '2026-08-28', name: 'Ezetimibe 10 mg', ingredient: 'ezetimibe', dailyDose: 10, doseUnit: 'mg' },
            ],
          },
        },
      } as unknown as CdssPatientProfile
    : profile

  const locale = english ? 'en' : 'zh-TW'
  const card = HYPERLIPIDEMIA_GUIDELINE_PACK.build({ profile: withAdjunct, locale })
    .recommendations.find(item => item.id === 'dyslipidemia-risk-and-target')
  const summary = card?.coverageSummary
  const aiAssist: NhiLipidAiAssist = {
    suggestions: aiSuggestions,
    decisions: aiDecisions,
    isRunning: false,
    isDataReady: true,
    error: null,
    modelId: 'synthetic-review-model',
    modelName: english ? 'Synthetic review model (no data sent)' : '合成測試模型（不送出資料）',
    run: async () => {
      setAiDecisions({})
      setAiSuggestions({
        smoking: {
          criterionId: 'smoking',
          state: 'yes',
          confidence: 'high',
          rationale: english
            ? 'The note explicitly documents current daily smoking.'
            : '病歷明確記載目前每日吸菸。',
          missing: [],
          evidence: [{
            sourceKey: 'D1',
            sourceResourceType: 'DocumentReference',
            sourceResourceId: 'synthetic-smoking-note',
            sourceLabel: english ? 'Synthetic outpatient note' : '合成門診紀錄',
            date: '2026-08-30',
            excerpt: english ? 'Currently smokes one pack daily.' : '目前每日抽菸一包。',
          }],
          modelId: 'synthetic-review-model',
          modelName: english ? 'Synthetic review model' : '合成測試模型',
          generatedAt: '2026-09-18T10:00:00+08:00',
        },
        'family-history': {
          criterionId: 'family-history',
          state: 'unknown',
          confidence: 'low',
          rationale: english
            ? 'No age-at-event information was found for first-degree relatives.'
            : '未找到一等親冠心病發病年齡。',
          missing: [english ? 'Family member and age at onset' : '親屬關係與發病年齡'],
          evidence: [],
          modelId: 'synthetic-review-model',
          modelName: english ? 'Synthetic review model' : '合成測試模型',
          generatedAt: '2026-09-18T10:00:00+08:00',
        },
      })
    },
    decide: (criterionId, decision) => {
      setAiDecisions((current) => ({ ...current, [criterionId]: decision }))
    },
  }

  return (
    <main className="mx-auto max-w-[80rem] p-3">
      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border p-3">
        <strong className="text-sm">合成案例 · 健保表一判級</strong>
        <select
          aria-label="案例"
          value={scenario}
          onChange={event => {
            setScenario(event.target.value)
            setAnswers({})
            setAnswerProvenance({})
            setAiSuggestions({})
            setAiDecisions({})
          }}
          className="min-h-11 rounded border bg-background p-2 text-sm"
        >
          {Object.entries(SCENARIOS).map(([id, item]) => (
            <option key={id} value={id}>{item.label}</option>
          ))}
        </select>
        <button type="button" className="min-h-11 text-sm underline" onClick={() => {
          setAnswers({})
          setAnswerProvenance({})
        }}>清除回答</button>
        <button type="button" className="min-h-11 text-sm underline" onClick={() => setEnglish(!english)}>中文 / English</button>
        <button type="button" className="min-h-11 text-sm underline" onClick={() => document.documentElement.classList.toggle('dark')}>明 / 暗</button>
      </div>
      <div className="@container rounded-lg border bg-card py-3">
        {summary ? (
          <NhiTable1Panel
            summary={summary}
            locale={locale}
            patientId={`synthetic-table1-${scenario}`}
            aiAssist={aiAssist}
            answerProvenance={answerProvenance}
            onAnswer={(id, state, provenance?: NhiLipidAnswerProvenance) => {
              setAnswerProvenance(current => {
                const next = { ...current }
                if (state === undefined) delete next[id]
                else next[id] = provenance ?? { source: 'manual' }
                return next
              })
              setAnswers(current => {
              const next = { ...current }
              if (state === undefined) delete next[id]
              else next[id] = state
              return next
              })
            }}
          />
        ) : (
          <p className="px-3 text-sm text-muted-foreground">本案例沒有健保分層卡。</p>
        )}
      </div>
    </main>
  )
}
