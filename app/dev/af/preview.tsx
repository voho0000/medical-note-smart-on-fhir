'use client'
import { applyAfCalculatorResults } from '@/features/clinical-decision-support/utils/af-calculators'
import { useEffect, useMemo, useState } from 'react'
import { ATRIAL_FIBRILLATION_GUIDELINE_PACK, HEART_FAILURE_GUIDELINE_PACK } from '@voho0000/personalized-care'
import { createFhirCdssPatientProfile } from '@voho0000/personalized-care-fhir'
import { ClinicalDecisionSupportView } from '@/features/clinical-decision-support/renderers/ClinicalDecisionSupportView'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAfAnswers, useAfAnswersStore } from '@/features/clinical-decision-support/stores/af-answers.store'
import { useEvidenceOverrides } from '@/features/clinical-decision-support/stores/evidence-overrides.store'
import { applyClinicVitals } from '@/features/clinical-decision-support/utils/apply-clinic-vitals'
import {
  useClinicVitals,
  useClinicVitalsStore,
} from '@/features/clinical-decision-support/stores/clinic-vitals.store'
import {
  usePhysicianDecisions,
  usePhysicianDecisionsStore,
} from '@/features/clinical-decision-support/stores/physician-decisions.store'
const scenarios = [
  { id: 'untreated', zh: '高風險未抗凝' },
  { id: 'apixaban', zh: 'Apixaban 劑量核對' },
  { id: 'valve', zh: '瓣膜與低 LVEF 安全' },
  { id: 'low', zh: '年輕／病史未補齊' },
  { id: 'hf', zh: 'HF 原版參考' },
]
function synthetic(id: string) {
  const age = id === 'low' ? 42 : id === 'apixaban' ? 82 : 78
  const codes =
    id === 'low'
      ? ['I48.0']
      : ['I48.0', 'I10', 'E11.9', ...(id === 'valve' ? ['Z95.2', 'I05.0', 'I50.9'] : [])]
  const lab = (key: string, code: string, value: number, unit: string) => ({
    id: key,
    status: 'final',
    effectiveDateTime: '2026-09-10',
    code: { coding: [{ system: 'http://loinc.org', code }] },
    valueQuantity: { value, unit },
  })
  const drug = (name: string, dose: number, frequency: number) => ({
    id: name,
    status: 'unknown',
    authoredOn: '2026-09-01',
    medicationCodeableConcept: { text: name },
    dispenseRequest: { expectedSupplyDuration: { value: 30, unit: 'days' } },
    dosageInstruction: [
      {
        doseAndRate: [{ doseQuantity: { value: dose, unit: 'mg' } }],
        timing: { repeat: { frequency, period: 1, periodUnit: 'd' } },
      },
    ],
  })
  return createFhirCdssPatientProfile({
    patient: { id: 'synthetic-af-' + id, age, gender: 'female' },
    conditions: codes.map((code) => ({
      id: code,
      clinicalStatus: 'active',
      code: { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code }] },
    })),
    encounters: [],
    observations: [
      lab('hr', '8867-4', id === 'valve' ? 125 : 88, 'bpm'),
      lab('weight', '29463-7', id === 'apixaban' ? 55 : 68, 'kg'),
      lab('cr', '2160-0', 1.2, 'mg/dL'),
      lab('egfr', '77147-7', 46, 'mL/min/1.73m2'),
      lab('hb', '718-7', 12.5, 'g/dL'),
      lab('platelets', '777-3', 180, '10*3/uL'),
      lab('ef', '10230-1', id === 'valve' ? 40 : 58, '%'),
    ],
    medications:
      id === 'apixaban'
        ? [drug('apixaban', 5, 2)]
        : id === 'valve'
          ? [drug('rivaroxaban', 20, 1), drug('diltiazem', 30, 3)]
          : [],
    allergies: [],
    carePlans: [],
    procedures: [],
    immunizations: [],
    now: new Date('2026-09-12T00:00:00+08:00'),
  })
}
export default function Preview() {
  const [scenario, setScenario] = useState('untreated'),
    [en, setEn] = useState(false)
  const patientId = 'synthetic-af-' + scenario,
    answers = useAfAnswers(patientId),
    overrides = useEvidenceOverrides(patientId),
    vitals = useClinicVitals(patientId),
    decisions = usePhysicianDecisions(patientId)
  useEffect(() => {
    useAfAnswersStore.getState().setPatient(patientId)
  }, [patientId])
  const original = useMemo(() => synthetic(scenario), [scenario])
  const profile = useMemo(
    () =>
      applyAfCalculatorResults(
        applyClinicVitals({ ...original, afClinicalAnswers: answers, evidenceOverrides: overrides }, vitals),
      ),
    [original, answers, overrides, vitals],
  )
  const pack = scenario === 'hf' ? HEART_FAILURE_GUIDELINE_PACK : ATRIAL_FIBRILLATION_GUIDELINE_PACK
  return (
    <TooltipProvider>
      <main className="@container mx-auto max-w-4xl p-3">
        <header className="mb-3 flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold">AF CDSS · 合成案例預覽</span>
          <label className="text-xs" htmlFor="af-case">
            案例
          </label>
          <select
            id="af-case"
            className="min-h-11 max-w-full rounded-md border border-input bg-background px-2 text-sm"
            value={scenario}
            onChange={(e) => setScenario(e.target.value)}
          >
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.zh}
              </option>
            ))}
          </select>
          <button
            className="min-h-11 rounded-md border border-border px-3 text-sm"
            onClick={() => setEn(!en)}
          >
            {en ? '繁體中文' : 'English'}
          </button>
        </header>
        <ClinicalDecisionSupportView
          key={patientId}
          result={pack.build({ profile, locale: en ? 'en' : 'zh-TW' })}
          locale={en ? 'en' : 'zh-TW'}
          patientId={patientId}
          profileFacts={profile.facts}
          layout="flow"
          afAnswers={answers}
          onAfAnswer={(id, value) => useAfAnswersStore.getState().answer(patientId, id, value)}
          clinicVitals={vitals}
          onSaveClinicVitals={(patch) => useClinicVitalsStore.getState().setVitals(patientId, patch)}
          physicianDecisions={decisions}
          onRecordDecision={(id, input) =>
            usePhysicianDecisionsStore.getState().recordDecision(patientId, id, input)
          }
          onClearDecision={(id) => usePhysicianDecisionsStore.getState().clearDecision(patientId, id)}
        />
      </main>
    </TooltipProvider>
  )
}
