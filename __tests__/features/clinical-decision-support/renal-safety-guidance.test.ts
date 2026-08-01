import { createFhirCdssPatientProfile } from '@/features/clinical-decision-support/adapters/fhir-cdss-profile'
import { RENAL_SAFETY_GUIDELINE_PACK } from '@voho0000/personalized-care'
import type {
  MedicationEntity,
  ObservationEntity,
} from '@/src/core/entities/clinical-data.entity'

const LOINC = 'http://loinc.org'
const UCUM = 'http://unitsofmeasure.org'

function lab(
  id: string,
  code: string,
  value: number,
  unit: string,
  date: string,
): ObservationEntity {
  return {
    id,
    resourceType: 'Observation',
    status: 'final',
    effectiveDateTime: date,
    code: { coding: [{ system: LOINC, code }] },
    valueQuantity: { value, unit, code: unit, system: UCUM },
  }
}

function medication(id: string, name: string): MedicationEntity {
  return {
    id,
    status: 'active',
    authoredOn: '2026-07-30',
    medicationCodeableConcept: { text: name },
  }
}

function profile(
  observations: ObservationEntity[],
  medications: MedicationEntity[] = [],
) {
  return createFhirCdssPatientProfile({
    patient: { id: 'renal-safety-patient', resourceType: 'Patient', age: 72 },
    conditions: [],
    encounters: [],
    observations,
    medications,
    allergies: [],
    carePlans: [],
    procedures: [],
    immunizations: [],
    now: new Date('2026-07-31T12:00:00+08:00'),
  })
}

describe('potassium and kidney-function medication safety pack', () => {
  it('triages a current severe potassium result and links medication clues without auto-stopping drugs', () => {
    const patientProfile = profile([
      lab('potassium', '2823-3', 6.7, 'mmol/L', '2026-07-31T08:00:00+08:00'),
      lab('egfr', '77147-7', 24, 'mL/min/1.73m2', '2026-07-31T08:00:00+08:00'),
    ], [
      medication('trimethoprim', 'Trimethoprim 160 mg'),
    ])

    expect(patientProfile.facts.currentHyperkalemiaRiskMedication?.sources?.[0])
      .toMatchObject({ resourceId: 'trimethoprim' })
    expect(patientProfile.facts.currentPotentialNephrotoxin).toBeUndefined()

    const result = RENAL_SAFETY_GUIDELINE_PACK.build({
      profile: patientProfile,
      locale: 'zh-TW',
    })
    expect(result.recommendations.find(
      (item) => item.id === 'renal-safety-potassium-triage',
    )).toMatchObject({
      priority: 'high',
      status: 'actionable',
      title: expect.stringContaining('立即核對與急症評估'),
      recommendation: expect.stringContaining('12 導程 ECG'),
      safetyBoundary: expect.stringContaining('不會自動給藥、停藥'),
    })
    expect(result.recommendations.find(
      (item) => item.id === 'renal-safety-medication-reconciliation',
    )).toMatchObject({
      priority: 'high',
      status: 'review',
    })
  })

  it('does not present a historical critical potassium as a current emergency', () => {
    const patientProfile = profile([
      lab('potassium-old', '2823-3', 6.7, 'mmol/L', '2026-01-01'),
    ])
    const result = RENAL_SAFETY_GUIDELINE_PACK.build({
      profile: patientProfile,
      locale: 'zh-TW',
    })
    expect(result.recommendations.find(
      (item) => item.id === 'renal-safety-potassium-triage',
    )).toMatchObject({
      priority: 'high',
      status: 'review',
      title: expect.stringContaining('歷史結果'),
      recommendation: expect.stringContaining('後續血鉀'),
    })
  })

  it('flags an adjacent eGFR drop greater than 20% as a verification signal', () => {
    const patientProfile = profile([
      lab('egfr-old', '77147-7', 50, 'mL/min/1.73m2', '2026-05-01'),
      lab('egfr-new', '77147-7', 35, 'mL/min/1.73m2', '2026-07-30'),
    ])
    const result = RENAL_SAFETY_GUIDELINE_PACK.build({
      profile: patientProfile,
      locale: 'zh-TW',
    })
    expect(result.recommendations.find(
      (item) => item.id === 'renal-safety-kidney-deterioration',
    )).toMatchObject({
      status: 'review',
      title: expect.stringContaining('下降 30%'),
      safetyBoundary: expect.stringContaining('不等同 AKI 診斷'),
    })
  })
})
