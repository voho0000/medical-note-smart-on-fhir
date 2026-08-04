import { createFhirCdssPatientProfile } from '@/features/clinical-decision-support/adapters/fhir-cdss-profile'
import { CKD_GUIDELINE_PACK } from '@voho0000/personalized-care'
import {
  getClinicalGuidelinePack,
  getEnabledClinicalGuidelinePacks,
} from '@/features/clinical-decision-support/guideline-packs/registry'
import { buildPhysicianSemanticCard } from '@/features/clinical-decision-support/utils/build-physician-semantic-card'
import type {
  CarePlanEntity,
  EncounterEntity,
  MedicationEntity,
  ObservationEntity,
} from '@/src/core/entities/clinical-data.entity'
import type { PatientEntity } from '@/src/core/entities/patient.entity'

const ICD10_SYSTEM = 'http://hl7.org/fhir/sid/icd-10-cm'
const LOINC_SYSTEM = 'http://loinc.org'
const UCUM_SYSTEM = 'http://unitsofmeasure.org'

const patient: PatientEntity = {
  id: 'ckd-patient',
  resourceType: 'Patient',
  age: 72,
}

function encounterWithDiagnoses(...codes: string[]): EncounterEntity {
  return {
    id: 'ckd-encounter',
    status: 'finished',
    period: { start: '2026-06-25T00:00:00+08:00' },
    reasonCode: codes.map((code) => ({
      coding: [{
        system: ICD10_SYSTEM,
        code,
        display: code === 'N18.32'
          ? 'Chronic kidney disease, stage 3b'
          : 'Type 2 diabetes mellitus',
      }],
    })),
  }
}

function egfr(id: string, date: string, value: number): ObservationEntity {
  return {
    id,
    resourceType: 'Observation',
    status: 'final',
    effectiveDateTime: date,
    code: {
      coding: [{
        system: LOINC_SYSTEM,
        code: '77147-7',
        display: 'Glomerular filtration rate',
      }],
    },
    valueQuantity: {
      value,
      unit: 'mL/min/1.73m2',
      system: UCUM_SYSTEM,
      code: 'mL/min/1.73m2',
    },
  }
}

function semiquantitativeUacr(value = '1+ (80)'): ObservationEntity {
  return {
    id: 'semiquant-uacr',
    resourceType: 'Observation',
    status: 'final',
    effectiveDateTime: '2026-05-01',
    code: {
      text: '尿液白蛋白／肌酸酐比（半定量）',
      coding: [{ system: LOINC_SYSTEM, code: '14959-1' }],
    },
    valueString: value,
  }
}

function quantitativeUacr(
  value: number,
  date = '2026-05-01',
  id = 'quantitative-uacr',
): ObservationEntity {
  return {
    id,
    resourceType: 'Observation',
    status: 'final',
    effectiveDateTime: date,
    code: {
      text: 'Urine albumin/creatinine ratio',
      coding: [{ system: LOINC_SYSTEM, code: '14959-1' }],
    },
    valueQuantity: {
      value,
      unit: 'mg/g',
      system: UCUM_SYSTEM,
      code: 'mg/g',
    },
  }
}

function currentMedication(
  id: string,
  name: string,
): MedicationEntity {
  return {
    id,
    _sourceResourceType: 'MedicationStatement',
    status: 'active',
    authoredOn: '2026-07-01',
    medicationCodeableConcept: { text: name },
  }
}

function activePrescription(
  id: string,
  name: string,
): MedicationEntity {
  return {
    id,
    _sourceResourceType: 'MedicationRequest',
    status: 'active',
    authoredOn: '2026-07-01',
    medicationCodeableConcept: { text: name },
  }
}

function lab(
  id: string,
  loinc: string,
  value: number,
  unit: string,
): ObservationEntity {
  return {
    id,
    resourceType: 'Observation',
    status: 'final',
    effectiveDateTime: '2026-06-20',
    code: { coding: [{ system: LOINC_SYSTEM, code: loinc }] },
    valueQuantity: {
      value,
      unit,
      system: UCUM_SYSTEM,
      code: unit,
    },
  }
}

function bloodPressure(value: { systolic: number; diastolic: number }): ObservationEntity {
  return {
    id: 'blood-pressure',
    resourceType: 'Observation',
    status: 'final',
    effectiveDateTime: '2026-06-20',
    code: { coding: [{ system: LOINC_SYSTEM, code: '85354-9' }] },
    component: [
      {
        code: { coding: [{ system: LOINC_SYSTEM, code: '8480-6' }] },
        valueQuantity: {
          value: value.systolic,
          unit: 'mmHg',
          system: UCUM_SYSTEM,
          code: 'mm[Hg]',
        },
      },
      {
        code: { coding: [{ system: LOINC_SYSTEM, code: '8462-4' }] },
        valueQuantity: {
          value: value.diastolic,
          unit: 'mmHg',
          system: UCUM_SYSTEM,
          code: 'mm[Hg]',
        },
      },
    ],
  }
}

const ckdCarePlans: CarePlanEntity[] = [
  {
    id: 'early-ckd',
    status: 'active',
    title: '初期慢性腎臟病照護計畫',
    period: { start: '2025-01-01' },
  },
  {
    id: 'pre-esrd',
    status: 'active',
    title: '末期腎臟病前期（Pre-ESRD）照護計畫',
    period: { start: '2026-01-01' },
  },
]

function buildProfile(input?: {
  patient?: PatientEntity
  encounters?: EncounterEntity[]
  observations?: ObservationEntity[]
  carePlans?: CarePlanEntity[]
  medications?: MedicationEntity[]
}) {
  return createFhirCdssPatientProfile({
    patient: input?.patient ?? patient,
    conditions: [],
    encounters: input?.encounters ?? [],
    observations: input?.observations ?? [],
    medications: input?.medications ?? [],
    allergies: [],
    carePlans: input?.carePlans ?? [],
    procedures: [],
    immunizations: [],
    now: new Date('2026-07-29T00:00:00Z'),
  })
}

describe('personalized CKD guidance', () => {
  it('registers enabled disease packs as separate switchable modules', () => {
    // Only the pathways currently being refined are surfaced; the rest are
    // built and tested but held back with `enabled: false`.
    // Switcher order: CKD first, then diabetes.
    expect(getEnabledClinicalGuidelinePacks().map((pack) => pack.id)).toEqual([
      'ckd-cdss',
      'dm-ckd-cdss',
    ])
    expect(getClinicalGuidelinePack('ckd-cdss')).toBe(CKD_GUIDELINE_PACK)
  })

  it('activates both disease paths from governed encounter diagnoses', () => {
    const profile = buildProfile({
      encounters: [encounterWithDiagnoses('E11.9', 'N18.32')],
      observations: [
        egfr('egfr-old', '2026-01-01', 38),
        egfr('egfr-latest', '2026-05-01', 34),
        semiquantitativeUacr(),
      ],
      carePlans: ckdCarePlans,
    })

    expect(profile.eligibleDiseasePackIds).toEqual(['dm-poc', 'ckd-poc'])
    expect(profile.diseasePackEligibility?.['ckd-poc']).toMatchObject({
      basis: 'encounter_diagnosis',
      resourceType: 'Encounter',
      resourceId: 'ckd-encounter',
      code: 'N18.32',
    })
    expect(profile.facts.ckdDiagnosis.sources?.[0]).toMatchObject({
      resourceType: 'Encounter',
      resourceId: 'ckd-encounter',
    })
    expect(profile.facts.ckdChronicity.zh).toContain('間隔達 3 個月')
    expect(profile.facts.ckdCareProgramOverlap.zh).toContain('同時存在')
  })

  it('does not activate CKD from one isolated low eGFR', () => {
    const profile = buildProfile({
      observations: [egfr('single-egfr', '2026-05-01', 34)],
    })

    expect(profile.eligibleDiseasePackIds).toBeUndefined()
    expect(profile.facts.ckdChronicity).toBeUndefined()
  })

  it('activates CKD from persistent reduced eGFR values at least 3 months apart', () => {
    const profile = buildProfile({
      observations: [
        egfr('egfr-old', '2026-01-01', 42),
        egfr('egfr-latest', '2026-05-01', 39),
      ],
    })

    expect(profile.eligibleDiseasePackIds).toEqual(['ckd-poc'])
    expect(profile.diseasePackEligibility?.['ckd-poc']).toMatchObject({
      basis: 'chronic_labs',
      resourceType: 'Observation',
      resourceId: 'egfr-latest',
      code: '77147-7',
    })
  })

  it('uses CKD guidelines and the Taiwan NHI medication coverage overlay', () => {
    const profile = buildProfile({
      encounters: [encounterWithDiagnoses('E11.9', 'N18.32')],
      observations: [
        egfr('egfr-old', '2026-01-01', 38),
        egfr('egfr-latest', '2026-05-01', 34),
        semiquantitativeUacr(),
      ],
      carePlans: ckdCarePlans,
    })
    const result = CKD_GUIDELINE_PACK.build({ profile, locale: 'zh-TW' })

    expect(result.knowledgePacks?.map((source) => source.id)).toEqual([
      'kdigo-ckd-2024',
      'kdigo-anemia-2026',
      'taiwan-ckd-2025',
      'taiwan-nhi-diabetes',
    ])
    expect(result.recommendations.find(
      (item) => item.id === 'ckd-classification',
    )).toMatchObject({
      status: 'needs-data',
      overviewEvidenceFactKey: 'urineAlbuminOverview',
      recommendation: '半定量 UACR 不列入 A 分期；補定量 UACR。',
    })
    expect(result.recommendations.find(
      (item) => item.id === 'ckd-kidney-failure-risk',
    )?.title).toContain('缺少定量 UACR')
    expect(result.recommendations.find(
      (item) => item.id === 'ckd-referral-care',
    )?.title).toContain('同時存在初期 CKD 與 Pre-ESRD')
    expect(result.recommendations.every((item) => (
      item.sourceAssessments?.every((source) => (
        source.sourceId === 'kdigo-ckd-2024'
        || source.sourceId === 'kdigo-anemia-2026'
        || source.sourceId === 'taiwan-ckd-2025'
        || source.sourceId === 'taiwan-nhi-diabetes'
      )) !== false
    ))).toBe(true)

    const coverage = result.recommendations.find(
      (item) => item.id === 'ckd-sglt2-strategy',
    )?.sourceAssessments?.find(
      (source) => source.sourceId === 'taiwan-nhi-diabetes',
    )
    expect(coverage).toMatchObject({
      sourceKind: 'coverage',
      status: 'needs-data',
    })
    expect(coverage?.missingData?.join(' ')).not.toContain('metformin')
    expect(coverage?.references).toEqual(expect.arrayContaining([
      expect.objectContaining({
        recommendationId: '2.16',
        page: 20,
      }),
      expect.objectContaining({
        recommendationId: '5.1.5',
        page: 3,
      }),
    ]))
  })

  it('names only the classification input that is actually missing', () => {
    const profile = buildProfile({
      encounters: [encounterWithDiagnoses('N18.32')],
      observations: [quantitativeUacr(80)],
    })
    const result = CKD_GUIDELINE_PACK.build({ profile, locale: 'zh-TW' })
    const classification = result.recommendations.find(
      (item) => item.id === 'ckd-classification',
    )

    expect(classification).toMatchObject({
      status: 'needs-data',
      title: '最近可判讀 CKD 分期：G3b / A2｜待更新：可比較的近期 eGFR',
      recommendation: '最近可判讀分期為 G3b / A2（極高風險）；需更新 可比較的近期 eGFR。',
      nextActions: [
        '補做或更新 可比較的近期 eGFR，更新 G/A 分期。',
        '更新後若仍為 G3b / A2，約每 4 個月追蹤 eGFR 與定量 UACR。',
        '若 eGFR 變化 >20% 或確認 ACR 倍增，應提早評估；開始影響腎血流的治療後 eGFR 降幅 >30% 亦應評估。',
      ],
    })
    expect(classification?.title).not.toContain('待補：定量 UACR')
  })

  it('keeps the CKD module order fixed when early modules are already checked', () => {
    const profile = buildProfile({
      encounters: [encounterWithDiagnoses('N18.32')],
      observations: [
        egfr('egfr-old', '2026-01-01', 35),
        egfr('egfr-latest', '2026-05-01', 34),
        quantitativeUacr(80),
      ],
    })
    const result = CKD_GUIDELINE_PACK.build({ profile, locale: 'zh-TW' })

    expect(result.automatedChecks?.find(
      (item) => item.id === 'ckd-classification',
    )).toMatchObject({
      displayOrder: 0,
      recommendation: {
        status: 'no-action',
        recommendation: '目前分期為 G3b / A2（極高風險）。',
        nextActions: [
          '約每 4 個月追蹤 eGFR 與定量 UACR。',
          '若 eGFR 變化 >20% 或確認 ACR 倍增，應提早評估；開始影響腎血流的治療後 eGFR 降幅 >30% 亦應評估。',
        ],
        patientEvidence: expect.arrayContaining([
          expect.objectContaining({
            label: '目前分期',
            value: 'G3b / A2（極高風險）',
          }),
        ]),
      },
    })
    expect(result.automatedChecks?.find(
      (item) => item.id === 'ckd-monitoring',
    )?.displayOrder).toBe(6)
  })

  it('expands CKD into independently actionable clinical modules while collapsing no-action checks', () => {
    const profile = buildProfile({
      encounters: [encounterWithDiagnoses('E11.9', 'N18.32')],
      observations: [
        egfr('egfr-old', '2026-01-01', 35),
        egfr('egfr-latest', '2026-05-01', 34),
        semiquantitativeUacr(),
      ],
      carePlans: ckdCarePlans,
    })
    const result = CKD_GUIDELINE_PACK.build({ profile, locale: 'zh-TW' })
    const allIds = [
      ...result.recommendations.map((item) => item.id),
      ...(result.automatedChecks ?? []).map((item) => item.id),
    ]

    expect(allIds).toEqual(expect.arrayContaining([
      'ckd-classification',
      'ckd-monitoring',
      'ckd-kidney-failure-risk',
      'ckd-blood-pressure-volume',
      'ckd-rasi-strategy',
      'ckd-sglt2-strategy',
      'ckd-finerenone-strategy',
      'ckd-cardiovascular-risk',
      'ckd-medication-safety',
      'ckd-anemia-monitoring',
      'ckd-potassium-acidosis',
      'ckd-mbd-monitoring',
      'ckd-nutrition',
      'immunization-review',
      'ckd-referral-care',
    ]))
    const allModules = [
      ...result.recommendations,
      ...(result.automatedChecks ?? []).flatMap((check) => (
        check.recommendation ? [check.recommendation] : []
      )),
    ]
    expect(Object.fromEntries(allModules.map((item) => [item.id, item.moduleGroup]))).toEqual({
      'ckd-classification': 'assessment',
      'ckd-kidney-failure-risk': 'assessment',
      'ckd-rasi-strategy': 'treatment',
      'ckd-sglt2-strategy': 'treatment',
      'ckd-finerenone-strategy': 'treatment',
      'ckd-cardiovascular-risk': 'treatment',
      'ckd-monitoring': 'monitoring',
      'ckd-blood-pressure-volume': 'monitoring',
      'ckd-medication-safety': 'monitoring',
      'ckd-anemia-monitoring': 'monitoring',
      'ckd-potassium-acidosis': 'monitoring',
      'ckd-mbd-monitoring': 'monitoring',
      'ckd-nutrition': 'care',
      'immunization-review': 'care',
      'ckd-referral-care': 'care',
    })
    expect(result.recommendations.length).toBeGreaterThan(6)
    expect(result.automatedChecks?.map((item) => item.id)).toContain('ckd-monitoring')
    const sglt2 = result.recommendations.find((item) => item.id === 'ckd-sglt2-strategy')
    expect(sglt2?.nextActions.join(' ')).not.toContain('重大手術')
    expect(sglt2?.nextActions).toEqual(['建議評估使用 SGLT2i。'])
    expect(sglt2).toMatchObject({
      status: 'actionable',
      hideMissingDataPreview: true,
    })
    expect(sglt2?.safetyBoundary).toContain('特定情境提醒')
    expect(sglt2?.safetyBoundary).toContain('至少停 3 天')
    expect(result.recommendations.find(
      (item) => item.id === 'ckd-mbd-monitoring',
    )?.guidelineReferences[0]).toMatchObject({
      page: 17,
      recommendationId: 'Recommendation 4.1.1',
      citedStatements: [{
        label: 'Recommendation 4.1.1',
        text: expect.stringContaining('serial assessments of phosphate, calcium, and PTH'),
      }],
    })
    const semanticCards = result.recommendations.map((recommendation) => (
      buildPhysicianSemanticCard(recommendation, 'zh-TW')
    ))
    expect(semanticCards.every((card) => card.guidelineRules.length > 0)).toBe(true)
    expect(semanticCards.find(
      (card) => card.id === 'immunization-review',
    )?.guidelineRules[0].reference).toMatchObject({
      recommendationId: '關鍵聲明 5、12、15–16',
      page: 3,
    })
  })

  it('shows only eligibility, medication state, and the immediate action in medication rows', () => {
    const profile = buildProfile({
      encounters: [encounterWithDiagnoses('E11.9', 'N18.32')],
      observations: [
        egfr('egfr-old', '2026-01-01', 35),
        egfr('egfr-latest', '2026-05-01', 34),
        quantitativeUacr(80),
      ],
    })
    const result = CKD_GUIDELINE_PACK.build({ profile, locale: 'zh-TW' })
    const medicationDecisions = Object.fromEntries(result.recommendations
      .filter((item) => [
        'ckd-rasi-strategy',
        'ckd-sglt2-strategy',
        'ckd-cardiovascular-risk',
      ].includes(item.id))
      .map((item) => [item.id, item]))

    expect(medicationDecisions['ckd-rasi-strategy']).toMatchObject({
      status: 'actionable',
      title: 'A2 白蛋白尿符合 ACEI／ARB 條件',
      nextActions: ['建議評估使用 ACEI 或 ARB。'],
      hideMissingDataPreview: true,
    })
    expect(medicationDecisions['ckd-sglt2-strategy']).toMatchObject({
      status: 'actionable',
      title: 'eGFR 20–45 適應症符合 SGLT2i 評估條件',
      nextActions: ['建議評估使用 SGLT2i。'],
      hideMissingDataPreview: true,
    })
    expect(medicationDecisions['ckd-cardiovascular-risk']).toMatchObject({
      status: 'actionable',
      title: '糖尿病 CKD 符合 statin 條件',
      nextActions: ['建議評估使用 statin。'],
      hideMissingDataPreview: true,
    })
    expect(medicationDecisions['ckd-rasi-strategy'].nextActions.join(' ')).not.toContain('2–4 週')
    expect(medicationDecisions['ckd-rasi-strategy'].safetyBoundary).toContain('2–4 週')
  })

  it('recommends finerenone only after its prerequisites are present', () => {
    const profile = buildProfile({
      encounters: [encounterWithDiagnoses('E11.9', 'N18.32')],
      observations: [
        egfr('egfr-old', '2026-01-01', 35),
        egfr('egfr-latest', '2026-05-01', 34),
        quantitativeUacr(80, '2026-05-01', 'uacr-latest'),
        quantitativeUacr(70, '2026-01-01', 'uacr-old'),
        lab('potassium', '2823-3', 4.5, 'mmol/L'),
      ],
      medications: [currentMedication('valsartan', 'Valsartan 160 mg')],
    })
    const result = CKD_GUIDELINE_PACK.build({ profile, locale: 'zh-TW' })
    const finerenone = result.recommendations.find(
      (item) => item.id === 'ckd-finerenone-strategy',
    )

    expect(finerenone).toMatchObject({
      status: 'actionable',
      title: 'T2D、持續 UACR >30、eGFR >25 且已用 RASi，符合 finerenone 條件',
      nextActions: ['建議評估使用 finerenone。'],
      hideMissingDataPreview: true,
    })
    expect(finerenone?.nextActions.join(' ')).not.toContain('4 週')
    expect(finerenone?.safetyBoundary).toContain('4 週')
  })

  it('treats maximally tolerated RASi as clinical review rather than missing passbook data', () => {
    const profile = buildProfile({
      encounters: [encounterWithDiagnoses('E11.9', 'N18.32')],
      observations: [
        egfr('egfr-old', '2026-01-01', 35),
        egfr('egfr-latest', '2026-05-01', 34),
        quantitativeUacr(80, '2026-05-01', 'uacr-latest'),
        quantitativeUacr(70, '2026-01-01', 'uacr-old'),
        lab('potassium', '2823-3', 4.5, 'mmol/L'),
      ],
    })
    const result = CKD_GUIDELINE_PACK.build({ profile, locale: 'zh-TW' })
    const finerenone = result.recommendations.find(
      (item) => item.id === 'ckd-finerenone-strategy',
    )

    expect(finerenone).toMatchObject({
      status: 'review',
      title: 'Finerenone 前先評估 RASi 治療',
      missingData: [],
      nextActions: ['先評估 RASi 治療，再評估 finerenone。'],
    })
    expect(JSON.stringify(finerenone)).not.toContain('最大耐受 RASi 處方或不耐受紀錄')
  })

  it('returns medication modules to green when current use is confirmed', () => {
    const profile = buildProfile({
      encounters: [encounterWithDiagnoses('E11.9', 'N18.32')],
      observations: [
        egfr('egfr-old', '2026-01-01', 35),
        egfr('egfr-latest', '2026-05-01', 34),
        quantitativeUacr(80, '2026-05-01', 'uacr-latest'),
        quantitativeUacr(70, '2026-01-01', 'uacr-old'),
        lab('potassium', '2823-3', 4.5, 'mmol/L'),
      ],
      medications: [
        currentMedication('valsartan', 'Valsartan 160 mg'),
        currentMedication('dapagliflozin', 'Dapagliflozin 10 mg'),
        currentMedication('finerenone', 'Finerenone 10 mg'),
        currentMedication('atorvastatin', 'Atorvastatin 20 mg'),
      ],
    })
    const result = CKD_GUIDELINE_PACK.build({ profile, locale: 'zh-TW' })
    const automatedById = Object.fromEntries((result.automatedChecks ?? []).map(
      (item) => [item.id, item.recommendation],
    ))

    expect(automatedById['ckd-rasi-strategy']).toMatchObject({
      status: 'no-action',
      nextActions: ['持續 ACEI／ARB。'],
    })
    expect(automatedById['ckd-sglt2-strategy']).toMatchObject({
      status: 'no-action',
      nextActions: ['持續 SGLT2i。'],
    })
    expect(automatedById['ckd-finerenone-strategy']).toMatchObject({
      status: 'no-action',
      nextActions: ['持續 finerenone。'],
    })
    expect(automatedById['ckd-cardiovascular-risk']).toMatchObject({
      status: 'no-action',
      nextActions: ['持續 statin。'],
    })
  })

  it('treats active prescriptions as present without asking whether the patient actually takes them', () => {
    const profile = buildProfile({
      encounters: [encounterWithDiagnoses('E11.9', 'N18.32')],
      observations: [
        egfr('egfr-old', '2026-01-01', 35),
        egfr('egfr-latest', '2026-07-01', 34),
        quantitativeUacr(80, '2026-07-01', 'uacr-latest'),
        quantitativeUacr(70, '2026-01-01', 'uacr-old'),
        lab('potassium', '2823-3', 4.5, 'mmol/L'),
      ],
      medications: [
        activePrescription('valsartan', 'Valsartan 160 mg'),
        activePrescription('dapagliflozin', 'Dapagliflozin 10 mg'),
        activePrescription('finerenone', 'Finerenone 10 mg'),
        activePrescription('atorvastatin', 'Atorvastatin 20 mg'),
      ],
    })
    const result = CKD_GUIDELINE_PACK.build({ profile, locale: 'zh-TW' })
    const automatedById = Object.fromEntries((result.automatedChecks ?? []).map(
      (item) => [item.id, item.recommendation],
    ))

    expect(automatedById['ckd-rasi-strategy']).toMatchObject({
      status: 'no-action',
      nextActions: ['已有 ACEI／ARB 處方。'],
    })
    expect(automatedById['ckd-sglt2-strategy']).toMatchObject({
      status: 'no-action',
      nextActions: ['已有 SGLT2i處方。'],
    })
    expect(automatedById['ckd-finerenone-strategy']).toMatchObject({
      status: 'no-action',
      nextActions: ['已有 finerenone 處方。'],
    })
    expect(automatedById['ckd-cardiovascular-risk']).toMatchObject({
      status: 'no-action',
      nextActions: ['已有 statin 處方。'],
    })
    expect(profile.facts.sglt2Therapy.zh).toBe('已有處方：Dapagliflozin 10 mg')
    expect(JSON.stringify(result)).not.toMatch(
      /尚未確認實際使用|確認目前是否使用|服藥依從性|目前無需另加提示/,
    )
    expect(result.notEvaluated).toEqual(expect.arrayContaining([
      expect.stringContaining('處方資料只代表曾開立或仍有有效處方'),
    ]))
  })

  it('labels an old UACR as the latest interpretable category and asks for an update', () => {
    const profile = buildProfile({
      encounters: [encounterWithDiagnoses('N18.32')],
      observations: [
        egfr('egfr-old', '2026-01-01', 35),
        egfr('egfr-latest', '2026-07-01', 34),
        quantitativeUacr(80, '2024-06-10'),
      ],
    })
    const result = CKD_GUIDELINE_PACK.build({ profile, locale: 'zh-TW' })
    const classification = result.recommendations.find(
      (item) => item.id === 'ckd-classification',
    )

    expect(classification).toMatchObject({
      status: 'needs-data',
      title: '最近可判讀 CKD 分期：G3b / A2｜待更新：近期定量 UACR（mg/g）',
      nextActions: [
        '補做或更新 近期定量 UACR（mg/g），更新 G/A 分期。',
        '更新後若仍為 G3b / A2，約每 4 個月追蹤 eGFR 與定量 UACR。',
        '若 eGFR 變化 >20% 或確認 ACR 倍增，應提早評估；開始影響腎血流的治療後 eGFR 降幅 >30% 亦應評估。',
      ],
      patientEvidence: expect.arrayContaining([
        expect.objectContaining({
          label: '最近可判讀分期',
          value: 'G3b / A2（極高風險）',
        }),
      ]),
    })
  })

  it('uses standardized-BP caution, staged finerenone criteria, medication safety, and serial CKD-MBD inputs', () => {
    const ibuprofen: MedicationEntity = {
      id: 'ibuprofen-order',
      _sourceResourceType: 'MedicationRequest',
      status: 'active',
      authoredOn: '2026-06-18',
      medicationCodeableConcept: { text: 'Ibuprofen 400 mg tablet' },
    }
    const profile = buildProfile({
      patient: { ...patient, gender: 'male' },
      encounters: [encounterWithDiagnoses('E11.9', 'N18.32')],
      observations: [
        egfr('egfr-old', '2026-01-01', 35),
        egfr('egfr-latest', '2026-05-01', 34),
        quantitativeUacr(80),
        bloodPressure({ systolic: 132, diastolic: 72 }),
        lab('potassium', '2823-3', 4.9, 'mmol/L'),
        lab('calcium', '17861-6', 9.1, 'mg/dL'),
        lab('phosphate', '2777-1', 3.5, 'mg/dL'),
        lab('pth', '2731-8', 76, 'pg/mL'),
        lab('alp', '6768-6', 88, 'U/L'),
      ],
      medications: [ibuprofen],
    })
    const result = CKD_GUIDELINE_PACK.build({ profile, locale: 'zh-TW' })
    const bloodPressureDecision = result.recommendations.find(
      (item) => item.id === 'ckd-blood-pressure-volume',
    )
    const finerenone = result.recommendations.find(
      (item) => item.id === 'ckd-finerenone-strategy',
    )
    const medicationSafety = result.recommendations.find(
      (item) => item.id === 'ckd-medication-safety',
    )
    const mbd = result.automatedChecks?.find(
      (item) => item.id === 'ckd-mbd-monitoring',
    )
    const nutrition = result.recommendations.find(
      (item) => item.id === 'ckd-nutrition',
    )

    expect(bloodPressureDecision).toMatchObject({
      status: 'review',
      title: '先確認量測方式與個人化目標',
    })
    expect(bloodPressureDecision?.safetyBoundary).toContain('非標準化血壓不可直接套用 <120')
    expect(finerenone).toMatchObject({
      status: 'needs-data',
      title: 'Finerenone 前置條件尚未完整',
    })
    expect(finerenone?.recommendation).toContain('4.8–5.0')
    expect(finerenone?.missingData).toEqual([
      '持續 UACR >30 mg/g 的重複定量紀錄',
    ])
    expect(finerenone?.nextActions).toEqual([
      '補齊：持續 UACR >30 mg/g 的重複定量紀錄。',
    ])
    expect(medicationSafety).toMatchObject({
      status: 'review',
      priority: 'high',
      overviewEvidenceFactKey: 'currentNsaid',
    })
    expect(profile.facts.parathyroidHormone.numericValue).toBe(76)
    expect(profile.facts.alkalinePhosphatase.numericValue).toBe(88)
    // The card no longer stops at "the results exist": with none of the three
    // flagged by the laboratory, KDIGO's progressive-or-persistent trigger is
    // simply not met.
    expect(mbd?.label).toBe('本次 P、Ca 與 PTH 未觸發 CKD-MBD 提示')
    expect(nutrition).toMatchObject({
      status: 'review',
      title: 'G3b 高齡情境：先評估肌少症與衰弱再設定營養目標',
      overviewEvidenceFactKey: 'eGFR',
    })
    expect(nutrition?.recommendation).toContain('年齡本身不等於衰弱')
    expect(nutrition?.missingData).toEqual([])
    expect(nutrition?.clinicalReviewItems).toContain(
      '飲食攝取、近期體重變化與肌少症／衰弱風險（需問診或正式評估）',
    )
    expect(nutrition?.safetyBoundary).toContain(
      'Albumin、年齡或單次體重都不能單獨診斷營養不良、肌少症或衰弱',
    )
    expect(nutrition?.guidelineReferences).toHaveLength(0)
    expect(nutrition?.sourceAssessments?.find(
      (source) => source.sourceId === 'kdigo-ckd-2024',
    )?.references[0]).toMatchObject({
      recommendationId: expect.stringContaining('3.3.1.1'),
      page: 42,
    })
  })

  it('interprets hemoglobin 12.1 g/dL as mild anemia in a male without prompting ESA', () => {
    const profile = buildProfile({
      patient: { ...patient, gender: 'male' },
      encounters: [encounterWithDiagnoses('N18.32')],
      observations: [
        egfr('egfr-latest', '2026-05-01', 34),
        quantitativeUacr(36.44),
        lab('hemoglobin', '718-7', 12.1, 'g/dL'),
        lab('potassium', '2823-3', 4.5, 'mmol/L'),
        lab('bicarbonate', '1963-8', 23.6, 'mmol/L'),
        lab('calcium', '17861-6', 9.1, 'mg/dL'),
        lab('phosphate', '2777-1', 3.5, 'mg/dL'),
      ],
    })
    const result = CKD_GUIDELINE_PACK.build({ profile, locale: 'zh-TW' })
    const complication = result.recommendations.find(
      (item) => item.id === 'ckd-anemia-monitoring',
    )

    expect(complication).toMatchObject({
      priority: 'medium',
      status: 'needs-data',
      title: '符合貧血定義，初始四項檢查尚缺 4 項',
    })
    expect(complication?.missingData).toEqual(expect.arrayContaining([
      'MCV',
      'Retic',
      'Ferritin',
      'TSAT',
    ]))
    expect(complication?.recommendation).not.toContain('bicarbonate 23.6 mmol/L')

    // A hemoglobin on its own must never reach the treatment card: without
    // ferritin and TSAT there is no iron threshold to apply, and ESA guidance
    // only follows once correctable causes have been addressed.
    const treatment = result.recommendations.find(
      (item) => item.id === 'ckd-anemia-iron-esa',
    )
    expect(treatment).toMatchObject({ status: 'needs-data' })
    expect(treatment?.recommendation).toContain('不以 Hb 單獨推定缺鐵')
  })

  it('does not trigger acidosis treatment for bicarbonate 23.6 mmol/L', () => {
    const profile = buildProfile({
      patient: { ...patient, gender: 'male' },
      encounters: [encounterWithDiagnoses('N18.32')],
      observations: [
        egfr('egfr-latest', '2026-05-01', 34),
        quantitativeUacr(36.44),
        lab('hemoglobin', '718-7', 13.5, 'g/dL'),
        lab('potassium', '2823-3', 4.5, 'mmol/L'),
        lab('bicarbonate', '1963-8', 23.6, 'mmol/L'),
        lab('calcium', '17861-6', 9.1, 'mg/dL'),
        lab('phosphate', '2777-1', 3.5, 'mg/dL'),
      ],
    })
    const result = CKD_GUIDELINE_PACK.build({ profile, locale: 'zh-TW' })
    const automated = result.automatedChecks?.find(
      (item) => item.id === 'ckd-potassium-acidosis',
    )

    expect(automated?.label).toContain('未觸發重要酸中毒提示')
  })

  it('flags bicarbonate below 18 mmol/L for clinical assessment', () => {
    const profile = buildProfile({
      patient: { ...patient, gender: 'male' },
      encounters: [encounterWithDiagnoses('N18.32')],
      observations: [
        egfr('egfr-latest', '2026-05-01', 34),
        quantitativeUacr(36.44),
        lab('hemoglobin', '718-7', 13.5, 'g/dL'),
        lab('potassium', '2823-3', 4.5, 'mmol/L'),
        lab('bicarbonate', '1963-8', 17.9, 'mmol/L'),
        lab('calcium', '17861-6', 9.1, 'mg/dL'),
        lab('phosphate', '2777-1', 3.5, 'mg/dL'),
      ],
    })
    const result = CKD_GUIDELINE_PACK.build({ profile, locale: 'zh-TW' })
    const complication = result.recommendations.find(
      (item) => item.id === 'ckd-potassium-acidosis',
    )

    expect(complication).toMatchObject({
      status: 'review',
      title: '評估具臨床重要性的代謝性酸中毒',
    })
  })

  it.each(['2028-9', '20565-8', '77143-6', '57922-7'])(
    'accepts total CO2 %s as the acid-base input and labels it by the reported analyte',
    (loinc) => {
      const profile = buildProfile({
        patient: { ...patient, gender: 'male' },
        encounters: [encounterWithDiagnoses('N18.32')],
        observations: [
          egfr('egfr-latest', '2026-05-01', 34),
          quantitativeUacr(36.44),
          lab('potassium', '2823-3', 4.5, 'mmol/L'),
          lab('total-co2', loinc, 17.9, 'mmol/L'),
        ],
      })
      const result = CKD_GUIDELINE_PACK.build({ profile, locale: 'zh-TW' })
      const complication = result.recommendations.find(
        (item) => item.id === 'ckd-potassium-acidosis',
      )

      expect(complication).toMatchObject({
        status: 'review',
        title: '評估具臨床重要性的代謝性酸中毒',
      })
      expect(complication?.patientEvidence).toEqual(expect.arrayContaining([
        expect.objectContaining({ label: '總 CO₂' }),
      ]))
      expect(complication?.safetyBoundary).toContain('pCO₂（mmHg）不可代入')
    },
  )

  it('does not substitute blood-gas pCO2 for bicarbonate or total CO2', () => {
    const profile = buildProfile({
      patient: { ...patient, gender: 'male' },
      encounters: [encounterWithDiagnoses('N18.32')],
      observations: [
        egfr('egfr-latest', '2026-05-01', 34),
        quantitativeUacr(36.44),
        lab('potassium', '2823-3', 4.5, 'mmol/L'),
        lab('pco2', '2019-8', 17.9, 'mmHg'),
      ],
    })
    const result = CKD_GUIDELINE_PACK.build({ profile, locale: 'zh-TW' })
    const complication = result.recommendations.find(
      (item) => item.id === 'ckd-potassium-acidosis',
    )

    expect(complication).toMatchObject({ status: 'needs-data' })
    expect(complication?.missingData).toContain('HCO3／Total CO2')
  })

  it('calls the shared KFRE engine when governed demographics, eGFR, and quantitative UACR are complete', () => {
    const profile = buildProfile({
      patient: { ...patient, gender: 'male' },
      encounters: [encounterWithDiagnoses('N18.32')],
      observations: [
        egfr('egfr-old', '2026-01-01', 38),
        egfr('egfr-latest', '2026-05-01', 34),
        quantitativeUacr(450),
      ],
    })
    const result = CKD_GUIDELINE_PACK.build({ profile, locale: 'zh-TW' })
    const kfre = result.recommendations.find(
      (item) => item.id === 'ckd-kidney-failure-risk',
    )

    expect(profile.demographics?.sex).toBe('male')
    expect(profile.facts.sex).toMatchObject({ zh: '男', en: 'Male' })
    expect(kfre).toMatchObject({
      status: 'review',
      priority: 'medium',
      overviewEvidenceFactKey: 'eGFR',
    })
    expect(kfre?.title).toBe('KFRE｜G3b：2 年 3.5%／5 年 12.9%')
    expect(kfre?.patientEvidence.map((item) => item.factKeys[0])).toEqual(
      expect.arrayContaining(['age', 'sex', 'eGFR', 'urineAlbuminOverview']),
    )
    expect(kfre?.rationale).toContain('醫療計算機共用')
    expect(kfre?.safetyBoundary).toContain('非北美區域校正')
  })

  it('shows a conservative KFRE lower-bound scenario for semiquantitative UACR >300', () => {
    const profile = buildProfile({
      patient: { ...patient, gender: 'male' },
      encounters: [encounterWithDiagnoses('N18.32')],
      observations: [
        egfr('egfr-old', '2026-01-01', 38),
        egfr('egfr-latest', '2026-05-01', 34),
        semiquantitativeUacr('2+ (>300 mg/g)'),
      ],
    })
    const result = CKD_GUIDELINE_PACK.build({ profile, locale: 'zh-TW' })
    const kfre = result.recommendations.find(
      (item) => item.id === 'ckd-kidney-failure-risk',
    )

    expect(profile.facts.urineAlbuminRatio.numericValue).toBeUndefined()
    expect(profile.observationContexts?.uacr.latestReading).toMatchObject({
      kind: 'semiquantitative',
      lowerBoundMgG: 300,
    })
    expect(kfre).toMatchObject({
      status: 'needs-data',
      overviewEvidenceFactKey: 'urineAlbuminOverview',
    })
    expect(kfre?.title).toMatch(
      /^KFRE 下限情境｜G3b：以 UACR 300 mg\/g 代入，2 年至少 \d+\.\d%／5 年至少 \d+\.\d%$/,
    )
    expect(kfre?.missingData).toContain(
      '定量 UACR（mg/g）；目前僅有半定量下限 300 mg/g',
    )
    expect(kfre?.safetyBoundary).toContain('只能得到風險下限，不是正式 KFRE')
  })

  it('keeps a low-risk KFRE result visible as a primary personalized-guidance module', () => {
    const profile = buildProfile({
      patient: { ...patient, age: 20, gender: 'female' },
      encounters: [encounterWithDiagnoses('N18.31')],
      observations: [
        egfr('egfr-old', '2026-01-01', 58),
        egfr('egfr-latest', '2026-05-01', 59),
        quantitativeUacr(1),
      ],
    })
    const result = CKD_GUIDELINE_PACK.build({ profile, locale: 'zh-TW' })
    const kfre = result.recommendations.find(
      (item) => item.id === 'ckd-kidney-failure-risk',
    )

    expect(kfre).toMatchObject({
      status: 'no-action',
      priority: 'routine',
    })
    expect(kfre?.title).toMatch(/^KFRE｜G3a：/)
    expect(result.automatedChecks?.map((item) => item.id))
      .not.toContain('ckd-kidney-failure-risk')
  })
})
