import { createFhirCdssPatientProfile } from '@/features/clinical-decision-support/adapters/fhir-cdss-profile'
import { ATRIAL_FIBRILLATION_GUIDELINE_PACK } from '@voho0000/personalized-care'
import { calculateDocumentedCha2ds2Vasc } from '@voho0000/personalized-care'
import type {
  ConditionEntity,
  MedicationEntity,
  ObservationEntity,
} from '@/src/core/entities/clinical-data.entity'

const ICD10 = 'http://hl7.org/fhir/sid/icd-10-cm'
const LOINC = 'http://loinc.org'
const UCUM = 'http://unitsofmeasure.org'

function condition(code: string): ConditionEntity {
  return {
    id: `condition-${code}`,
    clinicalStatus: 'active',
    verificationStatus: 'confirmed',
    recordedDate: '2026-01-01',
    code: { coding: [{ system: ICD10, code, display: code }] },
  }
}

function medication(id: string, name: string): MedicationEntity {
  return {
    id,
    status: 'active',
    authoredOn: '2026-07-01',
    medicationCodeableConcept: { text: name },
  }
}

function lab(id: string, code: string, value: number, unit: string): ObservationEntity {
  return {
    id,
    resourceType: 'Observation',
    status: 'final',
    effectiveDateTime: '2026-07-01',
    code: { coding: [{ system: LOINC, code }] },
    valueQuantity: { value, unit, code: unit, system: UCUM },
  }
}

function profile(input: {
  age: number
  gender: 'male' | 'female'
  codes: string[]
  medications?: MedicationEntity[]
}) {
  return createFhirCdssPatientProfile({
    patient: {
      id: 'af-patient',
      resourceType: 'Patient',
      age: input.age,
      gender: input.gender,
    },
    conditions: input.codes.map(condition),
    encounters: [],
    observations: [
      lab('egfr', '77147-7', 42, 'mL/min/1.73m2'),
      lab('hb', '718-7', 11.2, 'g/dL'),
      lab('platelets', '777-3', 180, '10*3/uL'),
    ],
    medications: input.medications ?? [],
    allergies: [],
    carePlans: [],
    procedures: [],
    immunizations: [],
    now: new Date('2026-07-31T00:00:00+08:00'),
  })
}

describe('AF anticoagulation appropriateness pack', () => {
  it('calculates a documented minimum score and does not treat missing components as negative evidence', () => {
    expect(calculateDocumentedCha2ds2Vasc({
      age: 66,
      sex: 'male',
      congestiveHeartFailure: false,
      hypertension: false,
      diabetes: false,
      priorStrokeTiaThromboembolism: false,
      vascularDisease: false,
    })).toMatchObject({
      score: 1,
      threshold: 'oral-anticoagulation-reasonable',
    })

    const patientProfile = profile({
      age: 78,
      gender: 'female',
      codes: ['I48.0', 'I50.9', 'I10', 'E11.9', 'I63.9', 'I70.2'],
      medications: [
        medication('apixaban', 'Apixaban 5 mg tablet'),
        medication('aspirin', 'Aspirin 100 mg'),
      ],
    })
    const result = ATRIAL_FIBRILLATION_GUIDELINE_PACK.build({
      profile: patientProfile,
      locale: 'zh-TW',
    })
    expect(result.recommendations.find(
      (item) => item.id === 'af-documented-cha2ds2-vasc',
    )).toMatchObject({
      title: expect.stringContaining('最低分：9 分'),
      safetyBoundary: expect.stringContaining('已證實最低分'),
    })
    expect(result.recommendations.find(
      (item) => item.id === 'af-anticoagulation-concordance',
    )).toMatchObject({
      status: 'review',
      overviewEvidenceFactKey: 'currentOralAnticoagulant',
    })
    expect(result.recommendations.find(
      (item) => item.id === 'af-bleeding-risk-data-gaps',
    )).toMatchObject({
      priority: 'high',
      status: 'review',
    })
  })

  it('flags a guideline-threshold patient when no oral anticoagulant is visible', () => {
    const patientProfile = profile({
      age: 66,
      gender: 'male',
      codes: ['I48.0', 'I10'],
    })
    const result = ATRIAL_FIBRILLATION_GUIDELINE_PACK.build({
      profile: patientProfile,
      locale: 'zh-TW',
    })
    expect(result.recommendations.find(
      (item) => item.id === 'af-anticoagulation-concordance',
    )).toMatchObject({
      priority: 'high',
      status: 'actionable',
      title: expect.stringContaining('未辨識到口服抗凝'),
      safetyBoundary: expect.stringContaining('可見處方缺席不等於'),
    })
  })

  it('creates a high-priority verification prompt for DOAC with rheumatic mitral stenosis', () => {
    const patientProfile = profile({
      age: 70,
      gender: 'male',
      codes: ['I48.0', 'I05.0'],
      medications: [medication('rivaroxaban', 'Rivaroxaban 20 mg')],
    })
    const result = ATRIAL_FIBRILLATION_GUIDELINE_PACK.build({
      profile: patientProfile,
      locale: 'zh-TW',
    })
    expect(result.recommendations.find(
      (item) => item.id === 'af-anticoagulant-selection-safety',
    )).toMatchObject({
      priority: 'high',
      status: 'actionable',
      title: expect.stringContaining('立即核對'),
    })
  })
})
