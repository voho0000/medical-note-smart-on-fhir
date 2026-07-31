import { createFhirCdssPatientProfile } from '@/features/clinical-decision-support/adapters/fhir-cdss-profile'
import { HYPERTENSION_GUIDELINE_PACK } from '@/features/clinical-decision-support/guideline-packs/hypertension-pack'
import {
  getClinicalGuidelinePack,
  getEnabledClinicalGuidelinePacks,
} from '@/features/clinical-decision-support/guideline-packs/registry'
import type {
  ConditionEntity,
  MedicationEntity,
  ObservationEntity,
} from '@/src/core/entities/clinical-data.entity'
import type { PatientEntity } from '@/src/core/entities/patient.entity'

const ICD10_SYSTEM = 'http://hl7.org/fhir/sid/icd-10-cm'
const LOINC_SYSTEM = 'http://loinc.org'
const UCUM_SYSTEM = 'http://unitsofmeasure.org'

const patient: PatientEntity = {
  id: 'hypertension-patient',
  resourceType: 'Patient',
  age: 67,
}

function hypertensionCondition(code = 'I10'): ConditionEntity {
  return {
    id: 'hypertension-condition',
    clinicalStatus: 'active',
    verificationStatus: 'confirmed',
    recordedDate: '2024-02-01',
    code: {
      coding: [{
        system: ICD10_SYSTEM,
        code,
        display: 'Essential (primary) hypertension',
      }],
    },
  }
}

function bloodPressure(
  systolic: number,
  diastolic: number,
  date = '2026-07-20',
): ObservationEntity {
  return {
    id: `bp-${systolic}-${diastolic}`,
    resourceType: 'Observation',
    status: 'final',
    effectiveDateTime: date,
    code: { coding: [{ system: LOINC_SYSTEM, code: '85354-9' }] },
    component: [
      {
        code: { coding: [{ system: LOINC_SYSTEM, code: '8480-6' }] },
        valueQuantity: {
          value: systolic,
          unit: 'mmHg',
          system: UCUM_SYSTEM,
          code: 'mm[Hg]',
        },
      },
      {
        code: { coding: [{ system: LOINC_SYSTEM, code: '8462-4' }] },
        valueQuantity: {
          value: diastolic,
          unit: 'mmHg',
          system: UCUM_SYSTEM,
          code: 'mm[Hg]',
        },
      },
    ],
  }
}

function medication(
  id: string,
  name: string,
  atcCode: string,
): MedicationEntity {
  return {
    id,
    status: 'active',
    authoredOn: '2026-07-01',
    _sourceResourceType: 'MedicationStatement',
    medicationCodeableConcept: {
      text: name,
      coding: [{
        system: 'https://www.whocc.no/atc',
        code: atcCode,
        display: name,
      }],
    },
  }
}

function profile(input?: {
  conditions?: ConditionEntity[]
  observations?: ObservationEntity[]
  medications?: MedicationEntity[]
}) {
  return createFhirCdssPatientProfile({
    patient,
    conditions: input?.conditions ?? [],
    encounters: [],
    observations: input?.observations ?? [],
    medications: input?.medications ?? [],
    allergies: [],
    carePlans: [],
    procedures: [],
    immunizations: [],
    now: new Date('2026-07-30T00:00:00+08:00'),
  })
}

describe('hypertension clinical guidance pack', () => {
  it('registers and activates from a governed hypertension diagnosis', () => {
    const result = profile({
      conditions: [hypertensionCondition()],
      observations: [bloodPressure(146, 92)],
    })

    expect(result.eligibleDiseasePackIds).toContain('hypertension-poc')
    expect(result.diseasePackEligibility?.['hypertension-poc']).toMatchObject({
      basis: 'condition',
      resourceType: 'Condition',
      code: 'I10',
    })
    expect(HYPERTENSION_GUIDELINE_PACK.enabled).toBe(false)
    expect(getClinicalGuidelinePack('hypertension-cdss')).toBeUndefined()
    expect(getEnabledClinicalGuidelinePacks().map((pack) => pack.id)).not.toContain(
      'hypertension-cdss',
    )
  })

  it('does not infer a hypertension diagnosis from one high BP reading', () => {
    const result = profile({
      observations: [bloodPressure(168, 98)],
    })

    expect(result.eligibleDiseasePackIds).toBeUndefined()
    expect(HYPERTENSION_GUIDELINE_PACK.applies(result)).toBe(false)
  })

  it('recognizes major antihypertensive classes and builds Taiwan and US source assessments', () => {
    const result = profile({
      conditions: [hypertensionCondition()],
      observations: [bloodPressure(148, 94)],
      medications: [
        medication('valsartan', 'Valsartan 80 mg', 'C09CA03'),
        medication('amlodipine', 'Amlodipine 5 mg', 'C08CA01'),
      ],
    })

    expect(result.medicationClassContexts).toMatchObject({
      'ace-inhibitor-or-arb': {
        state: 'confirmed-current',
        medicationNames: ['Valsartan 80 mg'],
      },
      'calcium-channel-blocker': {
        state: 'confirmed-current',
        medicationNames: ['Amlodipine 5 mg'],
      },
    })

    const guidance = HYPERTENSION_GUIDELINE_PACK.build({
      profile: result,
      locale: 'zh-TW',
    })
    const treatment = guidance.recommendations.find(
      (item) => item.id === 'hypertension-treatment-strategy',
    )

    expect(guidance.knowledgePacks?.map((pack) => pack.id)).toEqual([
      'taiwan-hypertension-2022',
      'aha-acc-hypertension-2025',
    ])
    expect(treatment).toMatchObject({
      status: 'review',
      title: expect.stringContaining('已確認 2 類'),
    })
    expect(treatment?.sourceAssessments?.map((item) => item.sourceId)).toEqual([
      'taiwan-hypertension-2022',
      'aha-acc-hypertension-2025',
    ])
    expect(treatment?.sourceAssessments?.[0].references).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recommendationId: 'Section 8.3',
          page: 44,
        }),
      ]),
    )
    expect(treatment?.sourceAssessments?.[1].references).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recommendationId: 'Section 5.2.4, Recommendations 1 and 3',
          directLink: true,
        }),
      ]),
    )
  })

  it('routes a severe value to target-organ-damage assessment without auto-labeling an emergency', () => {
    const guidance = HYPERTENSION_GUIDELINE_PACK.build({
      profile: profile({
        conditions: [hypertensionCondition()],
        observations: [bloodPressure(186, 124)],
      }),
      locale: 'zh-TW',
    })
    const safety = guidance.recommendations.find(
      (item) => item.id === 'hypertension-severe-safety',
    )

    expect(safety).toMatchObject({
      priority: 'high',
      status: 'review',
      title: expect.stringContaining('先排除高血壓急症'),
    })
    expect(safety?.recommendation).toContain('急性標的器官損傷')
    expect(safety?.safetyBoundary).toContain('不會只憑一筆血壓')
  })

  it('does not use an outdated BP to assign the current treatment stage', () => {
    const guidance = HYPERTENSION_GUIDELINE_PACK.build({
      profile: profile({
        conditions: [hypertensionCondition()],
        observations: [bloodPressure(154, 88, '2018-02-12')],
      }),
      locale: 'zh-TW',
    })
    const treatment = guidance.recommendations.find(
      (item) => item.id === 'hypertension-treatment-strategy',
    )

    expect(treatment).toMatchObject({
      status: 'needs-data',
      missingData: expect.arrayContaining([
        '近期標準化血壓平均',
      ]),
    })
    expect(treatment?.recommendation).toContain('過期血壓只作為歷史背景')
    expect(treatment?.recommendation).not.toContain('兩種不同第一線藥物開始')
  })
})
