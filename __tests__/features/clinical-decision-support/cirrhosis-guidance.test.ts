import { createFhirCdssPatientProfile } from '@/features/clinical-decision-support/adapters/fhir-cdss-profile'
import { CIRRHOSIS_GUIDELINE_PACK } from '@/features/clinical-decision-support/guideline-packs/cirrhosis-pack'
import {
  getClinicalGuidelinePack,
  getEnabledClinicalGuidelinePacks,
} from '@/features/clinical-decision-support/guideline-packs/registry'
import type {
  ConditionEntity,
  MedicationEntity,
  ObservationEntity,
  ProcedureEntity,
} from '@/src/core/entities/clinical-data.entity'
import type { PatientEntity } from '@/src/core/entities/patient.entity'

const ICD10_SYSTEM = 'http://hl7.org/fhir/sid/icd-10-cm'
const LOINC_SYSTEM = 'http://loinc.org'
const UCUM_SYSTEM = 'http://unitsofmeasure.org'

const patient: PatientEntity = {
  id: 'cirrhosis-patient',
  resourceType: 'Patient',
  age: 62,
  gender: 'male',
}

function condition(
  code: string,
  display: string,
  id = code,
): ConditionEntity {
  return {
    id,
    clinicalStatus: 'active',
    verificationStatus: 'confirmed',
    recordedDate: '2025-01-12',
    code: {
      coding: [{
        system: ICD10_SYSTEM,
        code,
        display,
      }],
    },
  }
}

function observation(
  id: string,
  code: string,
  value: number,
  unit: string,
  date = '2026-07-20',
): ObservationEntity {
  return {
    id,
    resourceType: 'Observation',
    status: 'final',
    effectiveDateTime: date,
    code: { coding: [{ system: LOINC_SYSTEM, code }] },
    valueQuantity: {
      value,
      unit,
      code: unit,
      system: UCUM_SYSTEM,
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
        system: 'https://www.whocc.no/atc',
        code: atcCode,
        display: name,
      }],
    },
  }
}

function liverUltrasound(date = '2026-06-18'): ProcedureEntity {
  return {
    id: 'liver-ultrasound',
    status: 'completed',
    performedDateTime: date,
    code: {
      text: 'Liver ultrasound for HCC surveillance',
      coding: [{
        system: 'http://www.ama-assn.org/go/cpt',
        code: '76705',
        display: 'Limited abdominal ultrasound',
      }],
    },
    note: [{ text: 'No focal liver lesion; visualization score B' }],
  }
}

function profile(input?: {
  conditions?: ConditionEntity[]
  observations?: ObservationEntity[]
  medications?: MedicationEntity[]
  procedures?: ProcedureEntity[]
}) {
  return createFhirCdssPatientProfile({
    patient,
    conditions: input?.conditions ?? [],
    encounters: [],
    observations: input?.observations ?? [],
    medications: input?.medications ?? [],
    allergies: [],
    carePlans: [],
    procedures: input?.procedures ?? [],
    immunizations: [],
    now: new Date('2026-07-31T00:00:00+08:00'),
  })
}

describe('cirrhosis clinical guidance pack', () => {
  it('registers and activates only from a governed cirrhosis diagnosis', () => {
    const result = profile({
      conditions: [condition('K74.60', 'Unspecified cirrhosis of liver')],
    })

    expect(result.eligibleDiseasePackIds).toContain('cirrhosis-poc')
    expect(result.diseasePackEligibility?.['cirrhosis-poc']).toMatchObject({
      basis: 'condition',
      resourceType: 'Condition',
      code: 'K74.60',
    })
    expect(CIRRHOSIS_GUIDELINE_PACK.enabled).toBe(true)
    expect(getClinicalGuidelinePack('cirrhosis-cdss')).toBe(CIRRHOSIS_GUIDELINE_PACK)
    expect(getEnabledClinicalGuidelinePacks().map((pack) => pack.id)).toContain(
      'cirrhosis-cdss',
    )
  })

  it('does not infer cirrhosis from thrombocytopenia or abnormal liver tests alone', () => {
    const result = profile({
      observations: [
        observation('platelets', '777-3', 82, '10*3/uL'),
        observation('bilirubin', '1975-2', 3.1, 'mg/dL'),
        observation('albumin', '1751-7', 2.8, 'g/dL'),
      ],
    })

    expect(result.eligibleDiseasePackIds).toBeUndefined()
    expect(CIRRHOSIS_GUIDELINE_PACK.applies(result)).toBe(false)
  })

  it('closes current HCC surveillance and recognizes CSPH and carvedilol evidence', () => {
    const result = profile({
      conditions: [condition('K74.60', 'Cirrhosis')],
      observations: [
        observation('afp', '1834-1', 7, 'ng/mL'),
        observation('platelets', '777-3', 108, '10*3/uL'),
        observation('liver-stiffness', '77791-7', 27, 'kPa'),
      ],
      medications: [
        medication('carvedilol', 'Carvedilol 6.25 mg', 'C07AG02'),
      ],
      procedures: [liverUltrasound()],
    })

    expect(result.facts).toMatchObject({
      AFP: { numericValue: 7, date: '2026-07-20' },
      plateletCount: { numericValue: 108 },
      liverStiffness: { numericValue: 27 },
      liverUltrasound: { date: '2026-06-18' },
    })
    expect(result.medicationClassContexts?.['nonselective-beta-blocker']).toMatchObject({
      state: 'confirmed-current',
      medicationNames: ['Carvedilol 6.25 mg'],
    })

    const guidance = CIRRHOSIS_GUIDELINE_PACK.build({
      profile: result,
      locale: 'zh-TW',
    })
    expect(guidance.title).toBe('肝硬化個人化照護指引')
    expect(guidance.recommendations.find(
      (item) => item.id === 'cirrhosis-hcc-surveillance',
    )).toMatchObject({
      status: 'no-action',
      title: expect.stringContaining('近 6 個月'),
    })
    expect(guidance.recommendations.find(
      (item) => item.id === 'cirrhosis-portal-hypertension',
    )).toMatchObject({
      status: 'review',
      title: expect.stringContaining('非選擇性 β 阻斷劑'),
    })
  })

  it('routes decompensation history to specialist review without labeling a current emergency', () => {
    const result = profile({
      conditions: [
        condition('K74.60', 'Cirrhosis'),
        condition('R18.8', 'Other ascites', 'ascites'),
        condition('K76.82', 'Hepatic encephalopathy', 'he'),
        condition('I85.01', 'Esophageal varices with bleeding', 'variceal-bleed'),
      ],
      medications: [
        medication('lactulose', 'Lactulose solution', 'A06AD11'),
        medication('rifaximin', 'Rifaximin 550 mg', 'A07AA11'),
      ],
    })

    expect(result.facts).toMatchObject({
      ascitesDiagnosis: expect.any(Object),
      hepaticEncephalopathyDiagnosis: expect.any(Object),
      varicealBleedingDiagnosis: expect.any(Object),
    })
    expect(result.medicationClassContexts).toMatchObject({
      lactulose: { state: 'confirmed-current' },
      rifaximin: { state: 'confirmed-current' },
    })

    const guidance = CIRRHOSIS_GUIDELINE_PACK.build({
      profile: result,
      locale: 'zh-TW',
    })
    const staging = guidance.recommendations.find(
      (item) => item.id === 'cirrhosis-stage-referral',
    )
    const encephalopathy = guidance.recommendations.find(
      (item) => item.id === 'cirrhosis-hepatic-encephalopathy',
    )

    expect(staging).toMatchObject({
      priority: 'high',
      status: 'review',
      title: expect.stringContaining('失代償事件'),
    })
    expect(staging?.safetyBoundary).toContain('不把它當成目前急症')
    expect(encephalopathy?.recommendation).toContain('每日約 2–3 次軟便')
    expect(encephalopathy?.safetyBoundary).toContain('血氨值')
  })

  it('escalates AFP at or above 20 to diagnostic imaging without diagnosing HCC', () => {
    const guidance = CIRRHOSIS_GUIDELINE_PACK.build({
      profile: profile({
        conditions: [condition('K74.60', 'Cirrhosis')],
        observations: [observation('afp', '1834-1', 24, 'ng/mL')],
      }),
      locale: 'zh-TW',
    })
    const hcc = guidance.recommendations.find(
      (item) => item.id === 'cirrhosis-hcc-surveillance',
    )

    expect(hcc).toMatchObject({
      priority: 'high',
      status: 'review',
      title: expect.stringContaining('AFP 24'),
    })
    expect(hcc?.recommendation).toContain('多期相增強 CT 或 MRI')
    expect(hcc?.safetyBoundary).toContain('不能單獨確診')
  })

  it('does not combine cross-date laboratory values into a MELD score', () => {
    const guidance = CIRRHOSIS_GUIDELINE_PACK.build({
      profile: profile({
        conditions: [condition('K74.60', 'Cirrhosis')],
        observations: [
          observation('bilirubin', '1975-2', 1.3, 'mg/dL', '2026-07-20'),
          observation('inr', '6301-6', 1.2, '1', '2026-07-18'),
          observation('creatinine', '2160-0', 1.0, 'mg/dL', '2026-07-20'),
          observation('sodium', '2951-2', 137, 'mmol/L', '2026-07-20'),
          observation('albumin', '1751-7', 3.6, 'g/dL', '2026-07-20'),
        ],
      }),
      locale: 'zh-TW',
    })
    const severity = guidance.recommendations.find(
      (item) => item.id === 'cirrhosis-severity-monitoring',
    )

    expect(severity).toMatchObject({
      status: 'needs-data',
      title: expect.stringContaining('不同日期'),
    })
    expect(severity?.safetyBoundary).toContain('不由跨日健康存摺資料自動產生 MELD')
  })
})
