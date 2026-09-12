/** Synthetic presentation profiles; no patient data. Adapter tests live in the rules repo. */
import type { CdssFact, CdssPatientProfile, CdssMedicationClassId } from '../types'

export const CORONARY_PREVIEW_SCENARIOS = ['stable', 'acs', 'safety', 'missing', 'empty', 'hf'] as const
export type CoronaryPreviewScenario = typeof CORONARY_PREVIEW_SCENARIOS[number]

export function coronaryPreviewProfile(scenario: CoronaryPreviewScenario, now: Date): CdssPatientProfile {
  const ago = (days: number) => new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10)
  const fact = (value: string, numericValue?: number, age = 18): CdssFact => ({
    zh: value, en: value, ...(numericValue === undefined ? {} : { numericValue }), date: ago(age),
    sources: [{ resourceType: 'Observation', resourceId: `synthetic-${value.replace(/\W/g, '')}`, date: ago(age) }],
  })
  const facts: Record<string, CdssFact> = {
    age: fact('68', 68), chronicCoronarySyndromeDiagnosis: fact('慢性冠心病 · I25.10', undefined, 500),
    LDL: fact('88 mg/dL', 88, 40), LVEF: fact('58%', 58, 60),
    bloodPressure: fact('124/76 mmHg', 124), heartRate: fact('66 bpm', 66),
    eGFR: fact('72 mL/min/1.73m²', 72), potassium: fact('4.1 mmol/L', 4.1), hemoglobin: fact('13.1 g/dL', 13.1),
    medicationListOverview: fact('合成處方紀錄'),
  }
  const medications: { -readonly [K in CdssMedicationClassId]?: NonNullable<CdssPatientProfile['medicationClassContexts']>[K] } = {}
  const med = (classId: CdssMedicationClassId, factKey: string, name?: string) => {
    facts[factKey] = { ...fact(name ? `目前用藥中：${name}` : '未使用'), en: name ? `Currently taking: ${name}` : 'Not taking' }
    medications[classId] = { state: name ? 'confirmed-current' : 'not-found', factKey, medicationNames: name ? [name] : [],
      lastPrescriptionDate: ago(200), dataWindowStartDate: ago(365), dataWindowEndDate: ago(0) }
  }
  med('aspirin', 'aspirinTherapy', 'aspirin 100 mg')
  med('p2y12-inhibitor', 'p2y12Therapy')
  med('statin', 'statinTherapy', 'atorvastatin 40 mg')
  med('ezetimibe', 'ezetimibeTherapy')
  med('pcsk9-inhibitor', 'pcsk9Therapy')
  if (scenario === 'acs' || scenario === 'safety') {
    const date = ago(60)
    facts.acuteCoronarySyndromeAdmission = {
      zh: `ACS 住院（${date}）`, en: `ACS admission (${date})`, date,
      sources: [{ resourceType: 'Encounter', resourceId: 'synthetic-acs', date,
        coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: 'I21.4' }] }],
    }
    med('p2y12-inhibitor', 'p2y12Therapy', 'ticagrelor 90 mg')
  }
  if (scenario === 'safety') med('nsaid-or-cox2-inhibitor', 'nsaidTherapy', 'ibuprofen 400 mg')
  if (scenario === 'missing') {
    delete facts.LDL
    delete facts.LVEF
    delete facts.bloodPressure
    delete facts.heartRate
    med('aspirin', 'aspirinTherapy')
    facts.potassium = fact('4.1 mmol/L', 4.1, 200)
  }
  if (scenario === 'empty') return { id: `synthetic-${scenario}`, evaluatedAt: now.toISOString(), facts: { age: facts.age } }
  if (scenario === 'hf') {
    facts.heartFailureDiagnosis = fact('心衰竭 · I50.22', undefined, 100)
    facts.LVEF = fact('32%', 32)
    facts.physicianSuspectedHf = fact('true')
  }
  return {
    id: `synthetic-${scenario}`, evaluatedAt: now.toISOString(), facts, medicationClassContexts: medications,
    freshnessContexts: {
      LDL: { factKey: 'LDL', state: 'current', intervalDays: 365 },
      potassium: { factKey: 'potassium', state: scenario === 'missing' ? 'overdue' : 'current', intervalDays: 90,
        date: facts.potassium.date, ageDays: scenario === 'missing' ? 200 : 18 },
      bloodPressure: { factKey: 'bloodPressure', state: 'current', intervalDays: 90 },
    },
  }
}
