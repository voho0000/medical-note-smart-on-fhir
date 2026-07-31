import { createFhirCdssPatientProfile } from '@/features/clinical-decision-support/adapters/fhir-cdss-profile'
import { CKD_GUIDELINE_PACK } from '@/features/clinical-decision-support/guideline-packs/ckd-pack'
import {
  getClinicalGuidelinePack,
  getEnabledClinicalGuidelinePacks,
} from '@/features/clinical-decision-support/guideline-packs/registry'
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

function quantitativeUacr(value: number): ObservationEntity {
  return {
    id: 'quantitative-uacr',
    resourceType: 'Observation',
    status: 'final',
    effectiveDateTime: '2026-05-01',
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
    expect(getEnabledClinicalGuidelinePacks().map((pack) => pack.id)).toEqual([
      'dm-ckd-cdss',
      'ckd-cdss',
      'hyperlipidemia-cdss',
      'heart-failure-cdss',
      'cirrhosis-cdss',
      'aki-alert-cdss',
      'renal-safety-cdss',
      'atrial-fibrillation-cdss',
      'ckd-anemia-cdss',
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
      'taiwan-ckd-2025',
      'taiwan-nhi-diabetes',
    ])
    expect(result.recommendations.find(
      (item) => item.id === 'ckd-classification',
    )).toMatchObject({
      status: 'needs-data',
      overviewEvidenceFactKey: 'urineAlbuminOverview',
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
    expect(result.recommendations.length).toBeGreaterThan(6)
    expect(result.automatedChecks?.map((item) => item.id)).toContain('ckd-monitoring')
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
      title: '血壓 132/72 mmHg：先確認量測方式與個人化目標',
    })
    expect(bloodPressureDecision?.safetyBoundary).toContain('非標準化血壓不可直接套用 <120')
    expect(finerenone).toMatchObject({
      status: 'needs-data',
      title: 'Finerenone 前置條件尚未完整',
    })
    expect(finerenone?.recommendation).toContain('4.8–5.0')
    expect(finerenone?.missingData).toEqual(expect.arrayContaining([
      '持續 UACR >30 mg/g 的重複定量紀錄',
      '最大耐受 RASi 持續使用與耐受紀錄',
    ]))
    expect(medicationSafety).toMatchObject({
      status: 'review',
      priority: 'high',
      overviewEvidenceFactKey: 'currentNsaid',
    })
    expect(profile.facts.parathyroidHormone.numericValue).toBe(76)
    expect(profile.facts.alkalinePhosphatase.numericValue).toBe(88)
    expect(mbd?.label).toBe('CKD-MBD 核心檢驗已有可用紀錄')
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
      status: 'review',
      title: 'Hb 12.1 g/dL：男性貧血，先評估原因與趨勢',
    })
    expect(complication?.missingData).toEqual(expect.arrayContaining([
      'CBC 連續趨勢與網狀紅血球',
      'ferritin 與 TSAT',
    ]))
    expect(complication?.recommendation).toContain('單一輕度貧血不直接觸發 ESA')
    expect(complication?.recommendation).not.toContain('bicarbonate 23.6 mmol/L')
    expect(complication?.sourceAssessments?.map((source) => source.sourceId)).not.toContain(
      'kdigo-anemia-2026',
    )
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
      title: 'Bicarbonate 17.9 mmol/L：評估具臨床重要性的代謝性酸中毒',
    })
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
