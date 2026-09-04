import { createFhirCdssPatientProfile } from '@/features/clinical-decision-support/adapters/fhir-cdss-profile'
import { HEART_FAILURE_GUIDELINE_PACK } from '@voho0000/personalized-care'
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
  id: 'heart-failure-patient',
  resourceType: 'Patient',
  birthDate: '1956-02-14',
}

function heartFailureCondition(code = 'I50.22'): ConditionEntity {
  return {
    id: 'heart-failure-condition',
    clinicalStatus: 'active',
    verificationStatus: 'confirmed',
    recordedDate: '2025-02-01',
    code: {
      coding: [{
        system: ICD10_SYSTEM,
        code,
        display: 'Chronic systolic (congestive) heart failure',
      }],
    },
  }
}

function lab(
  id: string,
  loinc: string,
  value: number,
  unit: string,
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
  source: 'MedicationStatement' | 'MedicationRequest' = 'MedicationStatement',
  supply?: { status: string, authoredOn: string, days: number },
): MedicationEntity {
  return {
    id,
    status: supply?.status ?? 'active',
    authoredOn: supply?.authoredOn ?? '2026-07-01',
    ...(supply ? {
      dispenseRequest: {
        expectedSupplyDuration: {
          value: supply.days,
          unit: 'days',
          system: UCUM_SYSTEM,
          code: 'd',
        },
      },
    } : {}),
    _sourceResourceType: source,
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
    now: new Date('2026-07-31T00:00:00+08:00'),
  })
}

describe('heart-failure clinical guidance pack', () => {
  it('registers and activates only from a governed heart-failure diagnosis', () => {
    const withDiagnosis = profile({
      conditions: [heartFailureCondition()],
      observations: [lab('lvef', '10230-1', 35, '%')],
    })
    const lvefOnly = profile({
      observations: [lab('lvef', '10230-1', 30, '%')],
    })

    expect(withDiagnosis.eligibleDiseasePackIds).toContain('heart-failure-poc')
    expect(withDiagnosis.diseasePackEligibility?.['heart-failure-poc']).toMatchObject({
      basis: 'condition',
      resourceType: 'Condition',
      code: 'I50.22',
    })
    expect(HEART_FAILURE_GUIDELINE_PACK.applies(lvefOnly)).toBe(false)
    // Held back from the switcher while DM/CKD/lipid are refined. The rules
    // stay covered here so the pathway can be switched on without rework.
    expect(HEART_FAILURE_GUIDELINE_PACK.enabled).toBe(false)
    expect(getClinicalGuidelinePack('heart-failure-cdss')).toBeUndefined()
    expect(getEnabledClinicalGuidelinePacks().map((pack) => pack.id)).not.toContain(
      'heart-failure-cdss',
    )
  })

  it('does not select phenotype-specific therapy when LVEF is unavailable', () => {
    const guidance = HEART_FAILURE_GUIDELINE_PACK.build({
      profile: profile({ conditions: [heartFailureCondition()] }),
      locale: 'zh-TW',
    })
    const phenotype = guidance.recommendations.find(
      (item) => item.id === 'heart-failure-phenotype',
    )

    // `medium`, not `high`: priority is time-to-harm, and an absent LVEF is a
    // data gap rather than a finding with a clock on it. The policy layer
    // enforces that agreement between priority and status.
    expect(phenotype).toMatchObject({
      priority: 'medium',
      status: 'needs-data',
      missingData: expect.arrayContaining(['最近一次正式 LVEF 與檢查日期']),
    })
    expect(phenotype?.safetyBoundary).toContain('不會被本模組自行轉成 LVEF 分型')
    expect(guidance.recommendations.map((item) => item.id)).not.toContain(
      'heart-failure-hfref-gdmt',
    )
  })

  it('extracts governed HF observations and confirms all four HFrEF pillars', () => {
    const result = profile({
      conditions: [heartFailureCondition()],
      observations: [
        lab('lvef', '10230-1', 35, '%'),
        lab('egfr', '77147-7', 62, 'mL/min/1.73m²'),
        lab('potassium', '2823-3', 4.4, 'mmol/L'),
        lab('sodium', '2951-2', 138, 'mmol/L'),
        lab('heart-rate', '8867-4', 68, '/min'),
        lab('weight', '29463-7', 71.5, 'kg'),
        lab('nt-pro-bnp', '33762-6', 860, 'pg/mL'),
      ],
      medications: [
        medication('arni', 'Sacubitril/valsartan 49/51 mg', 'C09DX04'),
        medication('beta-blocker', 'Carvedilol 6.25 mg', 'C07AG02'),
        medication('mra', 'Spironolactone 25 mg', 'C03DA01'),
        medication('sglt2', 'Dapagliflozin 10 mg', 'A10BK01'),
        medication('loop', 'Furosemide 40 mg', 'C03CA01'),
      ],
    })

    expect(result.facts).toMatchObject({
      LVEF: { numericValue: 35, unit: '%' },
      NTproBNP: { numericValue: 860, unit: 'pg/mL' },
      heartRate: { numericValue: 68, unit: 'bpm' },
      bodyWeight: { numericValue: 71.5, unit: 'kg' },
      sodium: { numericValue: 138, unit: 'mmol/L' },
    })
    expect(result.medicationClassContexts).toMatchObject({
      arni: { state: 'confirmed-current' },
      'hf-evidence-based-beta-blocker': { state: 'confirmed-current' },
      'mineralocorticoid-receptor-antagonist': { state: 'confirmed-current' },
      'sglt2-inhibitor': { state: 'confirmed-current' },
      'loop-diuretic': { state: 'confirmed-current' },
    })

    const guidance = HEART_FAILURE_GUIDELINE_PACK.build({
      profile: result,
      locale: 'zh-TW',
    })
    const gdmt = guidance.recommendations.find(
      (item) => item.id === 'heart-failure-hfref-gdmt',
    )

    expect(gdmt).toMatchObject({
      status: 'no-action',
      title: expect.stringContaining('已確認 4/4 類'),
    })
    expect(gdmt?.guidelineReferences).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'acc-hfref-ecdp-2024-core-gdmt',
        directLink: true,
      }),
      expect.objectContaining({
        id: 'aha-acc-hf-2022-hfref-four-pillars',
        page: 70,
      }),
    ]))
  })

  // The NHI cloud only ever sends a prescription: `active` while the supply
  // lasts, `completed` after. Both count as taking inside the 30-day refill
  // grace period, and neither leaves a third "ordered but unverified" state.
  it('counts a cloud prescription order as a confirmed pillar', () => {
    const guidance = HEART_FAILURE_GUIDELINE_PACK.build({
      profile: profile({
        conditions: [heartFailureCondition()],
        observations: [
          lab('lvef', '10230-1', 32, '%'),
          lab('egfr', '77147-7', 58, 'mL/min/1.73m²'),
          lab('potassium', '2823-3', 4.3, 'mmol/L'),
        ],
        medications: [
          medication('arni-order', 'Sacubitril/valsartan', 'C09DX04', 'MedicationRequest'),
          medication('beta-order', 'Bisoprolol', 'C07AB07', 'MedicationRequest'),
          medication('mra-order', 'Eplerenone', 'C03DA04', 'MedicationRequest'),
          // Supply ran out 2026-07-23, eight days before `now`: a late refill,
          // not a discontinuation.
          medication('sglt2-order', 'Empagliflozin', 'A10BK03', 'MedicationRequest', {
            status: 'completed',
            authoredOn: '2026-06-25',
            days: 28,
          }),
        ],
      }),
      locale: 'zh-TW',
    })
    const gdmt = guidance.recommendations.find(
      (item) => item.id === 'heart-failure-hfref-gdmt',
    )

    expect(gdmt).toMatchObject({
      status: 'no-action',
      title: expect.stringContaining('已確認 4/4 類'),
    })
  })

  it('reads prescriptions whose supply lapsed long ago as not taken', () => {
    const patientProfile = profile({
      conditions: [heartFailureCondition()],
      observations: [
        lab('lvef', '10230-1', 32, '%'),
        lab('egfr', '77147-7', 58, 'mL/min/1.73m²'),
        lab('potassium', '2823-3', 4.3, 'mmol/L'),
      ],
      // Supply ran out 2026-02-02, far outside the 30-day grace period.
      medications: [
        medication('arni-old', 'Sacubitril/valsartan', 'C09DX04', 'MedicationRequest', {
          status: 'completed', authoredOn: '2026-01-05', days: 28,
        }),
        medication('beta-old', 'Bisoprolol', 'C07AB07', 'MedicationRequest', {
          status: 'completed', authoredOn: '2026-01-05', days: 28,
        }),
        medication('mra-old', 'Eplerenone', 'C03DA04', 'MedicationRequest', {
          status: 'completed', authoredOn: '2026-01-05', days: 28,
        }),
        medication('sglt2-old', 'Empagliflozin', 'A10BK03', 'MedicationRequest', {
          status: 'completed', authoredOn: '2026-01-05', days: 28,
        }),
      ],
    })
    const guidance = HEART_FAILURE_GUIDELINE_PACK.build({
      profile: patientProfile,
      locale: 'zh-TW',
    })
    const gdmt = guidance.recommendations.find(
      (item) => item.id === 'heart-failure-hfref-gdmt',
    )

    expect(patientProfile.facts.arniTherapy.zh).toBe(
      '目前未使用（最近一筆處方 2026-02-02 結束）',
    )
    expect(patientProfile.medicationClassContexts?.arni).toMatchObject({
      state: 'not-found',
      lastPrescriptionDate: '2026-01-05',
    })
    expect(gdmt).toMatchObject({
      status: 'review',
      title: expect.stringContaining('已確認 0/4 類'),
    })
  })

  it('does not treat ingredient-only metoprolol coding as the evidence-based CR/XL formulation', () => {
    const genericMetoprolol = profile({
      medications: [medication('metoprolol', 'Metoprolol', 'C07AB02')],
    })
    const succinate = profile({
      medications: [
        medication('metoprolol-succinate', 'Metoprolol succinate CR/XL', 'C07AB02'),
      ],
    })

    expect(genericMetoprolol.medicationClassContexts).toMatchObject({
      'beta-blocker': { state: 'confirmed-current' },
      'hf-evidence-based-beta-blocker': { state: 'not-found' },
    })
    expect(succinate.medicationClassContexts).toMatchObject({
      'hf-evidence-based-beta-blocker': {
        state: 'confirmed-current',
        medicationNames: ['Metoprolol succinate CR/XL'],
      },
    })
  })

  it('detects HFimpEF from a governed LVEF trajectory and preserves the continue-GDMT boundary', () => {
    const guidance = HEART_FAILURE_GUIDELINE_PACK.build({
      profile: profile({
        conditions: [heartFailureCondition()],
        observations: [
          lab('lvef-old', '10230-1', 35, '%', '2024-02-10'),
          lab('lvef-current', '10230-1', 52, '%', '2026-07-20'),
        ],
      }),
      locale: 'zh-TW',
    })
    const phenotype = guidance.recommendations.find(
      (item) => item.id === 'heart-failure-phenotype',
    )
    const therapy = guidance.recommendations.find(
      (item) => item.id === 'heart-failure-hfimpEF-therapy',
    )

    // The measured LVEF values belong to the key-evidence column, not the heading.
    expect(phenotype?.title).toContain('符合 HFimpEF 軌跡')
    expect(therapy).toMatchObject({
      priority: 'high',
      status: 'review',
      recommendation: expect.stringContaining('不要只因目前 LVEF >40%'),
    })
    expect(therapy?.guidelineReferences[0]).toMatchObject({
      recommendationId: 'HFimpEF Recommendation 1',
      page: 109,
    })
  })

  it('uses the HFpEF pathway without diagnosing HFpEF from LVEF alone', () => {
    const guidance = HEART_FAILURE_GUIDELINE_PACK.build({
      profile: profile({
        conditions: [heartFailureCondition('I50.3')],
        observations: [lab('lvef', '10230-1', 60, '%')],
      }),
      locale: 'zh-TW',
    })
    const therapy = guidance.recommendations.find(
      (item) => item.id === 'heart-failure-hfpef-treatment',
    )

    expect(therapy?.missingData).toEqual(expect.arrayContaining([
      'HFpEF 的充盈壓證據、替代診斷與主要表型',
    ]))
    expect(therapy?.safetyBoundary).toContain('不把 LVEF ≥50% 單獨當成 HFpEF 確診')
    expect(therapy?.guidelineReferences).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'acc-hfpef-ecdp-2026-phenotype-management',
        version: '2026',
      }),
    ]))
  })

  it('escalates MRA plus potassium 5.5 or higher without issuing an automatic stop order', () => {
    const guidance = HEART_FAILURE_GUIDELINE_PACK.build({
      profile: profile({
        conditions: [heartFailureCondition()],
        observations: [
          lab('lvef', '10230-1', 30, '%'),
          lab('egfr', '77147-7', 42, 'mL/min/1.73m²'),
          lab('potassium', '2823-3', 5.6, 'mmol/L'),
        ],
        medications: [
          medication('mra', 'Spironolactone 25 mg', 'C03DA01'),
        ],
      }),
      locale: 'zh-TW',
    })
    const safety = guidance.recommendations.find(
      (item) => item.id === 'heart-failure-mra-safety',
    )

    expect(safety).toMatchObject({
      priority: 'high',
      status: 'review',
      title: expect.stringContaining('MRA 紀錄合併嚴重高血鉀'),
    })
    expect(safety?.safetyBoundary).toContain('不會觸發自動停藥')
  })

  it('flags governed current NSAID and HF-worsening medication records for review', () => {
    const guidance = HEART_FAILURE_GUIDELINE_PACK.build({
      profile: profile({
        conditions: [heartFailureCondition()],
        observations: [lab('lvef', '10230-1', 35, '%')],
        medications: [
          medication('nsaid', 'Ibuprofen 400 mg', 'M01AE01'),
          medication('tzs', 'Pioglitazone 15 mg', 'A10BG03'),
        ],
      }),
      locale: 'zh-TW',
    })
    const safety = guidance.recommendations.find(
      (item) => item.id === 'heart-failure-medication-safety',
    )

    expect(safety).toMatchObject({
      priority: 'high',
      status: 'review',
    })
    expect(safety?.patientEvidence.map((item) => item.label)).toEqual([
      'NSAID',
      '其他需核對藥物',
    ])
    expect(safety?.safetyBoundary).toContain('不會自行判定因果或自動停藥')
  })

  it('rejects LVEF with a non-percent unit or non-final status', () => {
    const result = profile({
      conditions: [heartFailureCondition()],
      observations: [
        lab('wrong-unit', '10230-1', 35, 'fraction'),
        {
          ...lab('preliminary', '10230-1', 40, '%'),
          status: 'preliminary',
        },
      ],
    })

    expect(result.facts.LVEF).toBeUndefined()
    const guidance = HEART_FAILURE_GUIDELINE_PACK.build({
      profile: result,
      locale: 'en',
    })
    expect(guidance.recommendations.find(
      (item) => item.id === 'heart-failure-phenotype',
    )?.status).toBe('needs-data')
  })
})
