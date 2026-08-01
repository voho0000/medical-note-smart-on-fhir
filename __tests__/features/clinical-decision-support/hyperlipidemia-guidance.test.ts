import { createFhirCdssPatientProfile } from '@/features/clinical-decision-support/adapters/fhir-cdss-profile'
import { HYPERLIPIDEMIA_GUIDELINE_PACK } from '@voho0000/personalized-care'
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
const ATC_SYSTEM = 'https://www.whocc.no/atc'

const patient: PatientEntity = {
  id: 'lipid-patient',
  resourceType: 'Patient',
  age: 62,
  gender: 'female',
}

function hyperlipidemiaCondition(code = 'E78.5'): ConditionEntity {
  return {
    id: 'hyperlipidemia-condition',
    clinicalStatus: 'active',
    verificationStatus: 'confirmed',
    recordedDate: '2025-02-01',
    code: {
      coding: [{
        system: ICD10_SYSTEM,
        code,
        display: 'Hyperlipidemia, unspecified',
      }],
    },
  }
}

function lab(
  id: string,
  loinc: string,
  value: number,
  unit = 'mg/dL',
  date = '2026-07-20',
): ObservationEntity {
  return {
    id,
    resourceType: 'Observation',
    status: 'final',
    effectiveDateTime: date,
    code: { coding: [{ system: LOINC_SYSTEM, code: loinc }] },
    valueQuantity: {
      value,
      unit,
      system: UCUM_SYSTEM,
      code: unit,
    },
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
        system: ATC_SYSTEM,
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

describe('hyperlipidemia clinical guidance pack', () => {
  it('registers and activates from a governed E78 diagnosis', () => {
    const result = profile({
      conditions: [hyperlipidemiaCondition()],
      observations: [lab('ldl', '2089-1', 142)],
    })

    expect(result.eligibleDiseasePackIds).toContain('hyperlipidemia-poc')
    expect(result.diseasePackEligibility?.['hyperlipidemia-poc']).toMatchObject({
      basis: 'condition',
      resourceType: 'Condition',
      code: 'E78.5',
    })
    expect(getClinicalGuidelinePack('hyperlipidemia-cdss')).toBe(
      HYPERLIPIDEMIA_GUIDELINE_PACK,
    )
    expect(getEnabledClinicalGuidelinePacks().map((pack) => pack.id)).toContain(
      'hyperlipidemia-cdss',
    )
  })

  it('activates a safety pathway for LDL-C at least 190 without labeling familial disease', () => {
    const result = profile({
      observations: [lab('severe-ldl', '2089-1', 214)],
    })

    expect(result.diseasePackEligibility?.['hyperlipidemia-poc']).toMatchObject({
      basis: 'ldl_severe_range',
      resourceType: 'Observation',
      resourceId: 'severe-ldl',
      code: '2089-1',
    })

    const guidance = HYPERLIPIDEMIA_GUIDELINE_PACK.build({
      profile: result,
      locale: 'zh-TW',
    })
    const severeLdl = guidance.recommendations.find(
      (item) => item.id === 'dyslipidemia-severe-ldl',
    )

    expect(severeLdl).toMatchObject({
      priority: 'high',
      status: 'actionable',
      title: expect.stringContaining('LDL-C 214'),
    })
    expect(severeLdl?.safetyBoundary).toContain('不會自動標記家族性高膽固醇血症')
    expect(guidance.knowledgePacks?.map((pack) => pack.id)).toEqual([
      'aha-acc-dyslipidemia-2026',
      'taiwan-lipid-2022',
    ])
  })

  it('does not activate from one LDL-C value below the severe threshold', () => {
    const result = profile({
      observations: [lab('moderate-ldl', '2089-1', 170)],
    })

    expect(result.eligibleDiseasePackIds).toBeUndefined()
    expect(HYPERLIPIDEMIA_GUIDELINE_PACK.applies(result)).toBe(false)
  })

  it('normalizes a complete lipid profile and calculates non-HDL-C only from same-day values', () => {
    const result = profile({
      conditions: [hyperlipidemiaCondition()],
      observations: [
        lab('total', '2093-3', 226),
        lab('ldl', '2089-1', 146),
        lab('hdl', '2085-9', 52),
        lab('tg', '2571-8', 140),
        lab('apob', '1884-6', 112),
        lab('lpa', '43583-4', 138, 'nmol/L'),
      ],
    })

    expect(result.facts).toMatchObject({
      LDL: { numericValue: 146, unit: 'mg/dL' },
      HDL: { numericValue: 52, unit: 'mg/dL' },
      triglycerides: { numericValue: 140, unit: 'mg/dL' },
      nonHDL: { numericValue: 174, unit: 'mg/dL' },
      apolipoproteinB: { numericValue: 112, unit: 'mg/dL' },
      lipoproteinA: { numericValue: 138, unit: 'nmol/L' },
    })
    expect(result.facts.nonHDL.sources?.map((source) => source.resourceId)).toEqual([
      'total',
      'hdl',
    ])
  })

  it('recognizes statin and nonstatin LDL-lowering classes', () => {
    const result = profile({
      conditions: [hyperlipidemiaCondition()],
      observations: [lab('ldl', '2089-1', 118)],
      medications: [
        medication('statin', 'Rosuvastatin 20 mg', 'C10AA07'),
        medication('ezetimibe', 'Ezetimibe 10 mg', 'C10AX09'),
        medication('pcsk9', 'Evolocumab', 'C10AX13'),
      ],
    })

    expect(result.medicationClassContexts).toMatchObject({
      statin: {
        state: 'confirmed-current',
        medicationNames: ['Rosuvastatin 20 mg'],
      },
      ezetimibe: {
        state: 'confirmed-current',
        medicationNames: ['Ezetimibe 10 mg'],
      },
      'pcsk9-inhibitor': {
        state: 'confirmed-current',
        medicationNames: ['Evolocumab'],
      },
    })
    expect(result.facts.ezetimibeTherapy.zh).toContain('Ezetimibe 10 mg')
    expect(result.facts.pcsk9Therapy.zh).toContain('Evolocumab')
  })

  it('prioritizes pancreatitis-risk review when triglycerides are at least 1000', () => {
    const result = profile({
      observations: [lab('very-high-tg', '2571-8', 1080)],
    })
    const guidance = HYPERLIPIDEMIA_GUIDELINE_PACK.build({
      profile: result,
      locale: 'zh-TW',
    })
    const triglycerideSafety = guidance.recommendations.find(
      (item) => item.id === 'dyslipidemia-severe-triglycerides',
    )

    expect(result.diseasePackEligibility?.['hyperlipidemia-poc']).toMatchObject({
      basis: 'triglyceride_severe_range',
      resourceId: 'very-high-tg',
    })
    expect(triglycerideSafety).toMatchObject({
      priority: 'high',
      status: 'review',
      title: expect.stringContaining('優先降低胰臟炎風險'),
    })
    expect(triglycerideSafety?.recommendation).toContain('極低脂飲食')
  })
})
