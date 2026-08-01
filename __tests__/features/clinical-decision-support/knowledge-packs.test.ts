import {
  applyClinicalSemanticPolicy,
  attachKnowledgeAssessments,
  buildClinicalSemanticRequirements,
  getEnabledKnowledgePacks,
} from '@voho0000/personalized-care'
import { getEnabledClinicalModules } from '@voho0000/personalized-care'
import { getDefaultClinicalGuidelinePack } from '@/features/clinical-decision-support/guideline-packs/registry'
import type {
  CdssPatientProfile,
  CdssRecommendation,
} from '@/features/clinical-decision-support/types'

const profile: CdssPatientProfile = {
  id: 'patient:dm-cdss',
  facts: {},
  medicationContexts: {
    forxiga: {
      sourceResourceType: 'MedicationRequest',
      status: 'active',
      useState: 'active_order_unconfirmed',
    },
  },
}

const ckdCoverageProfile: CdssPatientProfile = {
  ...profile,
  facts: {
    eGFR: {
      zh: '32 mL/min/1.73m²（2026-06-02）',
      en: '32 mL/min/1.73m² (2026-06-02)',
      numericValue: 32,
      date: '2026-06-02',
    },
    urineAlbuminRatio: {
      zh: '半定量 UACR：1+ (80)（2026-01-14）',
      en: 'Semiquantitative UACR: 1+ (80) (2026-01-14)',
      date: '2026-01-14',
    },
  },
  coverageContexts: {
    taiwanNhiSglt2: {
      product: 'dapagliflozin',
      prescriptionDate: '2026-06-25',
      earliestObservedPrescriptionDate: '2026-04-28',
      dailyUnits: 1,
      claimIndicationCodes: ['N18.32'],
      claimIndicationTexts: ['Chronic kidney disease, stage 3b'],
      indicationRoute: 'ckd',
      ckdCareProgramTitle: '末期腎臟病前期（Pre-ESRD）照護計畫',
    },
  },
}

function recommendation(
  id: string,
  domain: CdssRecommendation['domain'],
): CdssRecommendation {
  return {
    id,
    domain,
    priority: 'medium',
    status: 'needs-data',
    title: id,
    recommendation: 'recommendation',
    rationale: 'rationale',
    patientEvidence: [],
    missingData: ['missing'],
    nextActions: ['next'],
    guidelineReferences: [],
    safetyBoundary: 'boundary',
  }
}

describe('clinical semantic output policy', () => {
  it('separates retrievable record inputs from clinician-only judgment', () => {
    expect(buildClinicalSemanticRequirements('zh-TW', [
      {
        needed: true,
        kind: 'record-input',
        zh: '近期定量 UACR',
        en: 'Recent quantitative UACR',
      },
      {
        needed: true,
        kind: 'clinical-review',
        zh: '最大耐受 RASi 與不耐受原因',
        en: 'Maximally tolerated RAS inhibition and intolerance reason',
      },
    ])).toEqual({
      requirements: [
        { kind: 'record-input', label: '近期定量 UACR' },
        { kind: 'clinical-review', label: '最大耐受 RASi 與不耐受原因' },
      ],
      missingData: ['近期定量 UACR'],
      clinicalReviewItems: ['最大耐受 RASi 與不耐受原因'],
    })
  })

  it('removes repeated no-information text and retains care-changing actions', () => {
    const noAction = {
      ...recommendation('SGLT2 抑制劑已有處方', 'medication'),
      status: 'no-action' as const,
      title: 'SGLT2 抑制劑已有處方',
      nextActions: [
        'SGLT2 抑制劑已有處方',
        '已有 SGLT2 抑制劑處方，目前無需另加提示。',
        '依腎功能與適應症持續追蹤。',
      ],
    }
    const governed = applyClinicalSemanticPolicy({
      title: 'test',
      summary: 'test',
      packId: 'test',
      packVersion: 'test',
      recommendations: [noAction],
      automatedChecks: [{
        id: noAction.id,
        label: noAction.title,
        value: noAction.title,
        recommendation: noAction,
      }],
      notEvaluated: [],
      disclaimer: 'test',
    })

    expect(governed.recommendations[0].nextActions).toEqual([
      '已有 SGLT2i處方。',
      '依腎功能與適應症持續追蹤。',
    ])
    expect(governed.recommendations[0].title).toBe('SGLT2i已有處方')
    expect(governed.automatedChecks?.[0].recommendation?.nextActions).toEqual([
      '已有 SGLT2i處方。',
      '依腎功能與適應症持續追蹤。',
    ])
    expect(governed.automatedChecks?.[0]).toMatchObject({
      label: 'SGLT2i已有處方',
      value: 'SGLT2i已有處方',
    })
  })
})

describe('CDSS knowledge-pack registry', () => {
  it('places DCSI in the pluggable decision-module registry', () => {
    expect(getEnabledClinicalModules().map((module) => module.id)).toEqual(
      expect.arrayContaining([
        'dcsi-complication-burden',
        'immunization-review',
      ]),
    )

    const guideline = getDefaultClinicalGuidelinePack()
    const result = guideline.build({
      profile: {
        ...profile,
        eligibleDiseasePackIds: ['dm-poc'],
        diseasePackEligibility: {
          'dm-poc': {
            basis: 'condition',
            resourceType: 'Condition',
            codingSystem: 'http://hl7.org/fhir/sid/icd-10-cm',
            code: 'E11.22',
          },
        },
        facts: {
          eGFR: {
            zh: '32 mL/min/1.73m²',
            en: '32 mL/min/1.73m²',
            numericValue: 32,
            unit: 'mL/min/1.73m²',
          },
          kidneyDiagnosis: {
            zh: '糖尿病腎臟病',
            en: 'Diabetic kidney disease',
          },
        },
      },
      locale: 'zh-TW',
    })

    const dcsi = result.recommendations.find(
      (item) => item.id === 'dcsi-complication-burden',
    )
    expect(dcsi).toMatchObject({
      kind: 'risk-stratification',
      domain: 'complication',
      title: '併發症負荷（DCSI）',
      dcsi: {
        minimumScore: 1,
        assessedDomainCount: 1,
        totalDomainCount: 7,
      },
    })
    expect(dcsi?.sourceAssessments).toBeUndefined()
    expect(dcsi?.patientEvidence[0].value).toContain('1/7 類可判讀')
    expect(dcsi?.nextActions[0]).toContain('腎病變')
    expect(dcsi?.dcsi?.domains.reduce((sum, domain) => sum + domain.maxScore, 0)).toBe(13)
    expect(dcsi?.dcsi?.domains.find(
      (domain) => domain.id === 'neuropathy',
    )?.scoreCriteria).toEqual([expect.objectContaining({
      score: 1,
      summary: expect.stringContaining('最高 1 分'),
    })])
    expect(dcsi?.dcsi?.domains.find(
      (domain) => domain.id === 'metabolic',
    )?.scoreCriteria).toEqual([
      expect.objectContaining({ score: 1, summary: expect.stringContaining('未合併昏迷') }),
      expect.objectContaining({ score: 2, summary: expect.stringContaining('合併昏迷') }),
    ])
    expect('dcsi' in result).toBe(false)
  })

  it('enables all independently registered clinical knowledge sources', () => {
    expect(getEnabledKnowledgePacks().map((pack) => pack.metadata('zh-TW').id)).toEqual([
      'ada-2026',
      'taiwan-t2dm-2022',
      'taiwan-nhi-diabetes',
      'kdigo-ckd-2024',
      'kdigo-anemia-2026',
      'taiwan-ckd-2025',
      'taiwan-hypertension-2022',
      'aha-acc-hypertension-2025',
      'taiwan-lipid-2022',
      'aha-acc-dyslipidemia-2026',
    ])
  })

  it('provides precise ADA and Taiwan locations for the pluggable vaccine module', () => {
    const result = attachKnowledgeAssessments({
      profile,
      locale: 'zh-TW',
      recommendations: [recommendation('immunization-review', 'care-gap')],
    })
    const vaccine = result.recommendations[0]

    expect(vaccine.sourceAssessments?.find(
      (item) => item.sourceId === 'ada-2026',
    )?.references[0]).toMatchObject({
      recommendationId: 'Table 4.5',
      directLink: true,
    })
    expect(vaccine.sourceAssessments?.find(
      (item) => item.sourceId === 'taiwan-t2dm-2022',
    )?.references[0]).toMatchObject({
      page: 310,
      printedPage: '305',
    })
  })

  it('keeps NHI as a non-clinical coverage overlay', () => {
    const result = attachKnowledgeAssessments({
      profile: ckdCoverageProfile,
      locale: 'zh-TW',
      recommendations: [
        recommendation('complete-kidney-risk', 'monitoring'),
        recommendation('sglt2-concordance', 'medication'),
      ],
    })

    const monitoringNhi = result.recommendations[0].sourceAssessments?.find(
      (item) => item.sourceId === 'taiwan-nhi-diabetes',
    )
    const medicationNhi = result.recommendations[1].sourceAssessments?.find(
      (item) => item.sourceId === 'taiwan-nhi-diabetes',
    )

    expect(monitoringNhi).toMatchObject({
      sourceKind: 'coverage',
      status: 'not-applicable',
    })
    expect(medicationNhi).toMatchObject({
      sourceKind: 'coverage',
      status: 'needs-data',
    })
    expect(medicationNhi?.missingData).toHaveLength(4)
    expect(medicationNhi?.verifiedData).toEqual(expect.arrayContaining([
      expect.stringContaining('每日 1 錠'),
      expect.stringContaining('N18.32'),
      expect.stringContaining('不等同起始日'),
      expect.stringContaining('起始日不明'),
    ]))
    expect(medicationNhi?.verifiedData?.join(' ')).not.toContain('符合 25–60')
    expect(medicationNhi?.missingData?.join(' ')).not.toContain('metformin')
  })

  it('shows a semiquantitative UACR as present instead of calling it missing', () => {
    const guideline = getDefaultClinicalGuidelinePack()
    const result = guideline.build({
      profile: {
        ...ckdCoverageProfile,
        eligibleDiseasePackIds: ['dm-poc'],
        diseasePackEligibility: {
          'dm-poc': {
            basis: 'condition',
            resourceType: 'Condition',
            codingSystem: 'http://hl7.org/fhir/sid/icd-10-cm',
            code: 'E11.22',
          },
        },
        observationContexts: {
          uacr: { useState: 'not_quantitative_comparable' },
        },
      },
      locale: 'zh-TW',
    })

    const kidney = result.recommendations.find((item) => item.id === 'complete-kidney-risk')
    expect(kidney).toMatchObject({
      overviewEvidenceFactKey: 'urineAlbuminRatio',
      status: 'needs-data',
    })
    expect(kidney?.title).toContain('已有半定量 UACR')
    expect(kidney?.patientEvidence.find(
      (item) => item.factKeys.includes('urineAlbuminRatio'),
    )?.value).toContain('1+ (80)')
    expect(kidney?.missingData?.join(' ')).not.toContain('採檢日期')
    expect(kidney?.nextActions[0]).toContain('不轉換成定量分級')
  })

  it('shows the newest ACR and the latest quantitative result on one line', () => {
    const guideline = getDefaultClinicalGuidelinePack()
    const result = guideline.build({
      profile: {
        ...ckdCoverageProfile,
        eligibleDiseasePackIds: ['dm-poc'],
        diseasePackEligibility: {
          'dm-poc': {
            basis: 'condition',
            resourceType: 'Condition',
            codingSystem: 'http://hl7.org/fhir/sid/icd-10-cm',
            code: 'E11.22',
          },
        },
        facts: {
          ...ckdCoverageProfile.facts,
          urineAlbuminOverview: {
            zh: '1+ (80) · 2026-01-14 ｜ 最近定量：36.44 mg/g · 2024-06-10',
            en: '1+ (80) · 2026-01-14 | Latest quantitative: 36.44 mg/g · 2024-06-10',
            date: '2026-01-14',
          },
          urineAlbuminRatioQuantitative: {
            zh: '36.44 mg/g（2024-06-10）',
            en: '36.44 mg/g (2024-06-10)',
            numericValue: 36.44,
            unit: 'mg/g',
            date: '2024-06-10',
          },
        },
        observationContexts: {
          uacr: { useState: 'not_quantitative_comparable' },
        },
        freshnessContexts: {
          eGFR: {
            factKey: 'eGFR',
            state: 'current',
            intervalDays: 180,
          },
          quantitativeUacr: {
            factKey: 'urineAlbuminRatioQuantitative',
            state: 'overdue',
            date: '2024-06-10',
            intervalDays: 180,
          },
        },
      },
      locale: 'zh-TW',
    })

    const kidney = result.recommendations.find((item) => item.id === 'complete-kidney-risk')
    expect(kidney).toMatchObject({
      overviewEvidenceFactKey: 'urineAlbuminOverview',
      status: 'needs-data',
    })
    expect(kidney?.patientEvidence.find(
      (item) => item.factKeys.includes('urineAlbuminOverview'),
    )).toMatchObject({
      label: '最新 ACR',
      value: '1+ (80) · 2026-01-14 ｜ 最近定量：36.44 mg/g · 2024-06-10',
    })
    expect(kidney?.title).toContain('定量 UACR 已超過追蹤間隔')
    expect(kidney?.missingData?.join(' ')).toContain('最近一筆已超過此病人 6 個月追蹤間隔')
    expect(kidney?.missingData?.join(' ')).not.toContain('可用 mg/g 判讀')
  })

  it('uses the medication-list classification instead of asking the clinician to recheck insulin or sulfonylurea', () => {
    const guideline = getDefaultClinicalGuidelinePack()
    const result = guideline.build({
      profile: {
        ...profile,
        eligibleDiseasePackIds: ['dm-poc'],
        diseasePackEligibility: {
          'dm-poc': {
            basis: 'condition',
            resourceType: 'Condition',
            codingSystem: 'http://hl7.org/fhir/sid/icd-10-cm',
            code: 'E11.9',
          },
        },
        facts: {
          age: { zh: '94 歲', en: 'Age 94', numericValue: 94 },
          HbA1c: { zh: '6.6%', en: '6.6%', numericValue: 6.6 },
          hypoglycemiaRiskMedications: {
            zh: '有效用藥列表未見胰島素或磺醯脲',
            en: 'No insulin or sulfonylurea appears in the current medication list',
          },
        },
        medicationClassContexts: {
          insulin: {
            state: 'not-found',
            medicationNames: [],
            factKey: 'hypoglycemiaRiskMedications',
          },
          sulfonylurea: {
            state: 'not-found',
            medicationNames: [],
            factKey: 'hypoglycemiaRiskMedications',
          },
        },
      },
      locale: 'zh-TW',
    })

    const glycemic = result.recommendations.find(
      (item) => item.id === 'glycemic-safety-older-adult',
    )
    expect(glycemic).toMatchObject({
      status: 'review',
      priority: 'medium',
    })
    expect(glycemic?.missingData).not.toContain('實際服用情形與近期低血糖事件')
    expect(glycemic?.clinicalReviewItems).toContain(
      '健康狀態分層：共病負擔、ADL／IADL、認知與衰弱',
    )
    expect(glycemic?.title).toContain('ADL／IADL')
    expect(glycemic?.recommendation).toContain('尚未完成高齡糖尿病目標判讀')
  })

  it('distinguishes complex/intermediate from very complex/poor health at HbA1c 6.6%', () => {
    const guideline = getDefaultClinicalGuidelinePack()
    const build = (
      healthStatus: 'complex-intermediate' | 'very-complex-poor-health',
    ) => guideline.build({
      profile: {
        ...profile,
        eligibleDiseasePackIds: ['dm-poc'],
        diseasePackEligibility: {
          'dm-poc': {
            basis: 'condition',
            resourceType: 'Condition',
            codingSystem: 'http://hl7.org/fhir/sid/icd-10-cm',
            code: 'E11.9',
          },
        },
        olderAdultContext: { healthStatus },
        facts: {
          age: { zh: '94 歲', en: 'Age 94', numericValue: 94 },
          HbA1c: { zh: '6.6%', en: '6.6%', numericValue: 6.6 },
          hypoglycemiaRiskMedications: {
            zh: '現有資料未見胰島素或磺醯脲',
            en: 'No insulin or sulfonylurea appears in the available data',
          },
        },
        medicationClassContexts: {
          insulin: {
            state: 'not-found',
            medicationNames: [],
            factKey: 'hypoglycemiaRiskMedications',
          },
          sulfonylurea: {
            state: 'not-found',
            medicationNames: [],
            factKey: 'hypoglycemiaRiskMedications',
          },
        },
      },
      locale: 'zh-TW',
    })

    const complex = build('complex-intermediate')
    expect(complex.automatedChecks?.find(
      (item) => item.id === 'glycemic-safety-older-adult',
    )?.label).toContain('complex／intermediate health')

    const veryComplex = build('very-complex-poor-health').recommendations.find(
      (item) => item.id === 'glycemic-safety-older-adult',
    )
    expect(veryComplex).toMatchObject({ status: 'review', priority: 'medium' })
    expect(veryComplex?.title).toContain('不依單一 A1c 判斷')
    expect(veryComplex?.recommendation).toContain('避免低血糖與有症狀高血糖')
  })

  it('keeps hypoglycemia review active when insulin is actually present', () => {
    const guideline = getDefaultClinicalGuidelinePack()
    const result = guideline.build({
      profile: {
        ...profile,
        eligibleDiseasePackIds: ['dm-poc'],
        diseasePackEligibility: {
          'dm-poc': {
            basis: 'condition',
            resourceType: 'Condition',
            codingSystem: 'http://hl7.org/fhir/sid/icd-10-cm',
            code: 'E11.9',
          },
        },
        facts: {
          age: { zh: '94 歲', en: 'Age 94', numericValue: 94 },
          HbA1c: { zh: '6.6%', en: '6.6%', numericValue: 6.6 },
          hypoglycemiaRiskMedications: {
            zh: '有效用藥含 insulin glargine',
            en: 'Current medication list includes insulin glargine',
          },
        },
        medicationClassContexts: {
          insulin: {
            state: 'confirmed-current',
            medicationNames: ['insulin glargine'],
            factKey: 'hypoglycemiaRiskMedications',
          },
          sulfonylurea: {
            state: 'not-found',
            medicationNames: [],
            factKey: 'hypoglycemiaRiskMedications',
          },
        },
      },
      locale: 'zh-TW',
    })

    const glycemic = result.recommendations.find(
      (item) => item.id === 'glycemic-safety-older-adult',
    )
    expect(glycemic).toMatchObject({
      priority: 'high',
      status: 'review',
    })
    expect(glycemic?.title).toContain('先評估低血糖')
    expect(glycemic?.missingData).toContain('近期低血糖事件與個人糖化血色素目標')
  })

  it('generates cardiorenal medication and ASCVD lipid decisions from reusable profile fields', () => {
    const guideline = getDefaultClinicalGuidelinePack()
    const result = guideline.build({
      profile: {
        ...profile,
        eligibleDiseasePackIds: ['dm-poc'],
        diseasePackEligibility: {
          'dm-poc': {
            basis: 'condition',
            resourceType: 'Condition',
            codingSystem: 'http://hl7.org/fhir/sid/icd-10-cm',
            code: 'E11.22',
          },
        },
        facts: {
          age: { zh: '94 歲', en: 'Age 94', numericValue: 94 },
          HbA1c: { zh: '6.6%', en: '6.6%', numericValue: 6.6 },
          eGFR: { zh: '32', en: '32', numericValue: 32 },
          kidneyDiagnosis: { zh: '糖尿病腎臟病', en: 'Diabetic kidney disease' },
          hypertensionDiagnosis: { zh: '高血壓', en: 'Hypertension' },
          ascvdDiagnosis: { zh: '慢性缺血性心臟病', en: 'Chronic ischemic heart disease' },
          urineAlbuminRatio: { zh: '36.44 mg/g', en: '36.44 mg/g', numericValue: 36.44 },
          potassium: { zh: '3.7 mmol/L', en: '3.7 mmol/L', numericValue: 3.7 },
          totalCholesterol: { zh: '174 mg/dL', en: '174 mg/dL', numericValue: 174 },
          hypoglycemiaRiskMedications: {
            zh: '有效用藥列表未見胰島素或磺醯脲',
            en: 'No insulin or sulfonylurea',
          },
          aceArbTherapy: { zh: '有效用藥未見 ACEI／ARB', en: 'No ACE inhibitor or ARB' },
          finerenoneTherapy: { zh: '有效用藥未見 finerenone', en: 'No finerenone' },
          statinTherapy: { zh: '有效用藥未見 statin', en: 'No statin' },
        },
        medicationClassContexts: {
          insulin: { state: 'not-found', medicationNames: [], factKey: 'hypoglycemiaRiskMedications' },
          sulfonylurea: { state: 'not-found', medicationNames: [], factKey: 'hypoglycemiaRiskMedications' },
          statin: { state: 'not-found', medicationNames: [], factKey: 'statinTherapy' },
          'ace-inhibitor-or-arb': { state: 'not-found', medicationNames: [], factKey: 'aceArbTherapy' },
          finerenone: { state: 'not-found', medicationNames: [], factKey: 'finerenoneTherapy' },
        },
        observationContexts: {
          uacr: { useState: 'quantitative_comparable' },
        },
      },
      locale: 'zh-TW',
    })

    const kidneyMedication = result.recommendations.find(
      (item) => item.id === 'kidney-medication-strategy',
    )
    const lipid = result.recommendations.find(
      (item) => item.id === 'ascvd-lipid-strategy',
    )
    expect(kidneyMedication).toMatchObject({
      priority: 'high',
      status: 'actionable',
      title: 'CKD＋高血壓：現有資料未見 ACEI／ARB 處方',
    })
    expect(lipid).toMatchObject({
      priority: 'medium',
      status: 'review',
      title: 'ASCVD：現有資料未見 statin',
    })
    expect(lipid?.recommendation).toContain('預期效益時間')
    expect(lipid?.recommendation).toContain('最大耐受強度')
    expect(lipid?.patientEvidence.map((item) => item.label)).toEqual([
      'ASCVD',
      '總膽固醇',
      '系統核對 statin',
    ])
    expect(lipid?.missingData).toContain('LDL-C 與採檢日期')
    expect(kidneyMedication?.sourceAssessments?.find(
      (item) => item.sourceId === 'ada-2026',
    )?.references[0].url).toContain('#:~:text=11.6a')
    expect(lipid?.sourceAssessments?.find(
      (item) => item.sourceId === 'taiwan-t2dm-2022',
    )?.references[0].url).toBe(
      '/clinical-guidelines/taiwan-t2dm-2022/2022-t2dm-guideline.pdf#page=152',
    )
  })

  it.each([
    {
      potassium: 5.1,
      expectedStatus: 'review',
      expectedTitle: '血鉀 5.1 mmol/L，現在不應開始',
      expectedRecommendation: '不應開始 finerenone',
    },
    {
      potassium: 4.9,
      expectedStatus: 'review',
      expectedTitle: '僅在臨床判斷下考慮並加密監測',
      expectedRecommendation: '並非一律禁止',
    },
    {
      potassium: undefined,
      expectedStatus: 'needs-data',
      expectedTitle: '先補近期血鉀',
      expectedRecommendation: '階段式提示',
    },
  ])(
    'stages finerenone review at potassium $potassium',
    ({ potassium, expectedStatus, expectedTitle, expectedRecommendation }) => {
      const guideline = getDefaultClinicalGuidelinePack()
      const result = guideline.build({
        profile: {
          ...profile,
          eligibleDiseasePackIds: ['dm-poc'],
          diseasePackEligibility: {
            'dm-poc': {
              basis: 'condition',
              resourceType: 'Condition',
              codingSystem: 'http://hl7.org/fhir/sid/icd-10-cm',
              code: 'E11.22',
            },
          },
          facts: {
            eGFR: { zh: '32', en: '32', numericValue: 32 },
            kidneyDiagnosis: { zh: '糖尿病腎臟病', en: 'Diabetic kidney disease' },
            hypertensionDiagnosis: { zh: '高血壓', en: 'Hypertension' },
            urineAlbuminRatio: { zh: '36.44 mg/g', en: '36.44 mg/g', numericValue: 36.44 },
            ...(potassium !== undefined
              ? {
                  potassium: {
                    zh: `${potassium} mmol/L`,
                    en: `${potassium} mmol/L`,
                    numericValue: potassium,
                  },
                }
              : {}),
            aceArbTherapy: { zh: '已確認使用 valsartan', en: 'Confirmed valsartan use' },
            finerenoneTherapy: { zh: '現有資料未見 finerenone', en: 'No finerenone' },
          },
          medicationClassContexts: {
            'ace-inhibitor-or-arb': {
              state: 'confirmed-current',
              medicationNames: ['valsartan'],
              factKey: 'aceArbTherapy',
            },
            finerenone: {
              state: 'not-found',
              medicationNames: [],
              factKey: 'finerenoneTherapy',
            },
          },
          observationContexts: {
            uacr: { useState: 'quantitative_comparable' },
          },
        },
        locale: 'zh-TW',
      })
      const kidneyMedication = result.recommendations.find(
        (item) => item.id === 'kidney-medication-strategy',
      )

      expect(kidneyMedication?.status).toBe(expectedStatus)
      expect(kidneyMedication?.title).toContain(expectedTitle)
      expect(kidneyMedication?.recommendation).toContain(expectedRecommendation)
      expect(kidneyMedication?.missingData).toContain('UACR >30 mg/g 是否為持續性')
      expect(kidneyMedication?.missingData).not.toContain('RASi 是否已達最大耐受劑量')
    },
  )

  it('keeps a historical ACEI/ARB prescription in review with its last date', () => {
    const guideline = getDefaultClinicalGuidelinePack()
    const result = guideline.build({
      profile: {
        ...profile,
        eligibleDiseasePackIds: ['dm-poc'],
        diseasePackEligibility: {
          'dm-poc': {
            basis: 'condition',
            resourceType: 'Condition',
            codingSystem: 'http://hl7.org/fhir/sid/icd-10-cm',
            code: 'E11.22',
          },
        },
        facts: {
          eGFR: { zh: '32', en: '32', numericValue: 32 },
          kidneyDiagnosis: { zh: '糖尿病腎臟病', en: 'Diabetic kidney disease' },
          hypertensionDiagnosis: { zh: '高血壓', en: 'Hypertension' },
          aceArbTherapy: {
            zh: '有歷史 ACEI／ARB 處方：valsartan（最後處方 2026-04-12）',
            en: 'Historical valsartan prescription (last prescription 2026-04-12)',
          },
        },
        medicationClassContexts: {
          'ace-inhibitor-or-arb': {
            state: 'historical-record-current-status-unknown',
            medicationNames: ['valsartan'],
            factKey: 'aceArbTherapy',
            lastPrescriptionDate: '2026-04-12',
            dataWindowStartDate: '2025-05-20',
            dataWindowEndDate: '2026-06-25',
          },
        },
      },
      locale: 'zh-TW',
    })
    const kidneyMedication = result.recommendations.find(
      (item) => item.id === 'kidney-medication-strategy',
    )

    expect(kidneyMedication).toMatchObject({
      status: 'review',
      title: 'CKD＋高血壓：ACEI／ARB 為歷史處方（最後處方 2026-04-12）',
    })
    expect(kidneyMedication?.nextActions).toEqual([
      '依最後處方日期與目前適應症評估是否續方。',
    ])
  })

  it('keeps cardiorenal SGLT2 benefit independent of HbA1c and uses the FDA perioperative hold', () => {
    const result = getDefaultClinicalGuidelinePack().build({
      profile: {
        ...profile,
        eligibleDiseasePackIds: ['dm-poc'],
        diseasePackEligibility: {
          'dm-poc': {
            basis: 'condition',
            resourceType: 'Condition',
            codingSystem: 'http://hl7.org/fhir/sid/icd-10-cm',
            code: 'E11.22',
          },
        },
        facts: {
          HbA1c: { zh: '6.6%', en: '6.6%', numericValue: 6.6 },
          eGFR: { zh: '32', en: '32', numericValue: 32 },
          kidneyDiagnosis: { zh: '糖尿病腎臟病', en: 'Diabetic kidney disease' },
          forxiga: { zh: 'Forxiga 10 mg', en: 'Forxiga 10 mg' },
          forxigaUseStatus: {
            zh: '病歷記載目前使用中',
            en: 'Recorded as currently used',
          },
        },
        medicationContexts: {
          forxiga: {
            sourceResourceType: 'MedicationStatement',
            status: 'active',
            useState: 'confirmed_current',
          },
        },
      },
      locale: 'zh-TW',
    })
    const sglt2 = result.automatedChecks?.find(
      (item) => item.id === 'sglt2-concordance',
    )?.recommendation

    expect(sglt2).toMatchObject({
      status: 'no-action',
      recommendation: '符合糖尿病 CKD 的 SGLT2i 條件，且已有處方。',
    })
    expect(sglt2?.nextActions).toEqual(['已有 SGLT2i處方。'])
    expect(sglt2?.safetyBoundary).toContain('至少停 3 天')
    expect(sglt2?.safetyBoundary).toContain('不要把顯影劑檢查一律設為停藥條件')
    expect(sglt2?.guidelineReferences.find(
      (item) => item.id === 'FDA-FARXIGA-2024-2.4',
    )).toMatchObject({
      page: 4,
      recommendationId: 'Section 2.4',
    })
  })

  it('checks metformin prerequisites only for the type 2 diabetes coverage route', () => {
    const result = attachKnowledgeAssessments({
      profile: {
        ...profile,
        coverageContexts: {
          taiwanNhiSglt2: {
            product: 'dapagliflozin',
            prescriptionDate: '2026-06-25',
            dailyUnits: 1,
            claimIndicationCodes: ['E11.9'],
            claimIndicationTexts: ['Type 2 diabetes mellitus'],
            indicationRoute: 't2dm',
          },
        },
      },
      locale: 'zh-TW',
      recommendations: [recommendation('sglt2-concordance', 'medication')],
    })

    const nhi = result.recommendations[0].sourceAssessments?.find(
      (item) => item.sourceId === 'taiwan-nhi-diabetes',
    )
    expect(nhi?.missingData?.join(' ')).toContain('metformin')
  })

  it('uses UACR chronology around treatment initiation instead of mixing different dates', () => {
    const result = attachKnowledgeAssessments({
      profile: {
        ...ckdCoverageProfile,
        coverageContexts: {
          taiwanNhiSglt2: {
            ...ckdCoverageProfile.coverageContexts!.taiwanNhiSglt2!,
            confirmedTreatmentStartDate: '2026-02-20',
          },
        },
        facts: {
          ...ckdCoverageProfile.facts,
          urineAlbuminRatio: {
            zh: '36.44 mg/g（2026-03-14）',
            en: '36.44 mg/g (2026-03-14)',
            numericValue: 36.44,
            unit: 'mg/g',
            date: '2026-03-14',
          },
        },
        observationContexts: {
          uacr: {
            useState: 'quantitative_comparable',
            readings: [
              {
                kind: 'quantitative',
                date: '2026-03-14',
                numericValueMgG: 36.44,
                zh: '36.44 mg/g（2026-03-14）',
                en: '36.44 mg/g (2026-03-14)',
              },
              {
                kind: 'semiquantitative',
                date: '2026-02-12',
                lowerBoundMgG: 300,
                zh: '半定量 UACR：2+ (>=300)（2026-02-12）',
                en: 'Semiquantitative UACR: 2+ (>=300) (2026-02-12)',
              },
            ],
          },
        },
      },
      locale: 'zh-TW',
      recommendations: [recommendation('sglt2-concordance', 'medication')],
    })

    const nhi = result.recommendations[0].sourceAssessments?.find(
      (item) => item.sourceId === 'taiwan-nhi-diabetes',
    )
    expect(nhi?.status).toBe('needs-data')
    expect(nhi?.summary).not.toContain('不在 200–5000')
    expect(nhi?.verifiedData).toEqual(expect.arrayContaining([
      expect.stringContaining('2+ (>=300)'),
    ]))
    expect(nhi?.verifiedData?.join(' ')).not.toContain('36.44')
    expect(nhi?.missingData?.join(' ')).toContain('起始治療時採用')
  })

  it('attaches one normalized assessment per enabled source', () => {
    const result = attachKnowledgeAssessments({
      profile,
      locale: 'en',
      recommendations: [recommendation('older-adult-safety', 'safety')],
    })

    expect(result.knowledgePacks).toHaveLength(10)
    expect(result.recommendations[0].sourceAssessments).toHaveLength(10)
    expect(result.recommendations[0].sourceAssessments?.map((item) => item.sourceId)).toEqual(
      result.knowledgePacks.map((pack) => pack.id),
    )
  })

  it('anchors the current NHI SGLT2 evidence to exact rules and PDF pages', () => {
    const result = attachKnowledgeAssessments({
      profile,
      locale: 'zh-TW',
      recommendations: [recommendation('sglt2-concordance', 'medication')],
    })

    const nhi = result.recommendations[0].sourceAssessments?.find(
      (item) => item.sourceId === 'taiwan-nhi-diabetes',
    )

    expect(nhi).toMatchObject({
      version: '第 5 節 115.07.23／第 2 節 115.05.22',
      effectiveFrom: '2026-07-23',
    })
    expect(nhi?.references).toEqual(expect.arrayContaining([
      expect.objectContaining({
        recommendationId: '5.1.5',
        page: 3,
        url: '/clinical-guidelines/taiwan-nhi/chap5_1150723.pdf#page=3',
      }),
      expect.objectContaining({
        recommendationId: '2.16',
        page: 20,
        url: '/clinical-guidelines/taiwan-nhi/chap2_1150522.pdf#page=20',
      }),
    ]))
  })

  it('assesses statin initiation against the NHI lipid threshold and opens the exact table', () => {
    const result = attachKnowledgeAssessments({
      profile: {
        ...profile,
        facts: {
          ascvdDiagnosis: {
            zh: '慢性缺血性心臟病',
            en: 'Chronic ischemic heart disease',
          },
          totalCholesterol: {
            zh: '174 mg/dL',
            en: '174 mg/dL',
            numericValue: 174,
            unit: 'mg/dL',
          },
        },
        medicationClassContexts: {
          statin: {
            state: 'not-found',
            medicationNames: [],
            factKey: 'statinTherapy',
          },
        },
      },
      locale: 'zh-TW',
      recommendations: [recommendation('ascvd-lipid-strategy', 'medication')],
    })

    const nhi = result.recommendations[0].sourceAssessments?.find(
      (item) => item.sourceId === 'taiwan-nhi-diabetes',
    )

    expect(nhi).toMatchObject({
      status: 'covered',
      summary: expect.stringContaining('TC ≥160'),
    })
    expect(nhi?.verifiedData).toContain('總膽固醇 174 mg/dL')
    expect(nhi?.references[0]).toMatchObject({
      recommendationId: '2.6.1',
      page: 10,
      url: '/clinical-guidelines/taiwan-nhi/chap2_1150522.pdf#page=10',
    })
  })

  it('connects the ACEI/ARB card to the exact NHI CKD prerequisite when that route applies', () => {
    const result = attachKnowledgeAssessments({
      profile: {
        ...ckdCoverageProfile,
        medicationClassContexts: {
          'ace-inhibitor-or-arb': {
            state: 'not-found',
            medicationNames: [],
            factKey: 'aceArbTherapy',
          },
        },
      },
      locale: 'zh-TW',
      recommendations: [recommendation('kidney-medication-strategy', 'medication')],
    })

    const nhi = result.recommendations[0].sourceAssessments?.find(
      (item) => item.sourceId === 'taiwan-nhi-diabetes',
    )

    expect(nhi).toMatchObject({
      status: 'needs-data',
      summary: expect.stringContaining('至少 4 週'),
    })
    expect(nhi?.missingData?.join(' ')).toContain('SGLT2 起始前')
    expect(nhi?.references[0]).toMatchObject({
      recommendationId: '2.16',
      page: 20,
      url: '/clinical-guidelines/taiwan-nhi/chap2_1150522.pdf#page=20',
    })
  })

  it('does not invent a class-wide NHI threshold for standard adult ACEI/ARB therapy', () => {
    const result = attachKnowledgeAssessments({
      profile: {
        ...profile,
        medicationClassContexts: {
          'ace-inhibitor-or-arb': {
            state: 'not-found',
            medicationNames: [],
            factKey: 'aceArbTherapy',
          },
        },
      },
      locale: 'zh-TW',
      recommendations: [recommendation('kidney-medication-strategy', 'medication')],
    })

    const nhi = result.recommendations[0].sourceAssessments?.find(
      (item) => item.sourceId === 'taiwan-nhi-diabetes',
    )

    expect(nhi).toMatchObject({
      status: 'no-special-rule',
      summary: expect.stringContaining('未設成人 CKD＋高血壓'),
    })
  })

  it('opens the ADA and Taiwan SGLT2 recommendations at their exact source locations', () => {
    const result = attachKnowledgeAssessments({
      profile,
      locale: 'zh-TW',
      recommendations: [recommendation('sglt2-concordance', 'medication')],
    })

    const ada = result.recommendations[0].sourceAssessments?.find(
      (item) => item.sourceId === 'ada-2026',
    )
    const taiwan = result.recommendations[0].sourceAssessments?.find(
      (item) => item.sourceId === 'taiwan-t2dm-2022',
    )

    expect(ada?.references[0]).toMatchObject({
      recommendationId: '9.10',
      evidenceGrade: 'A',
      directLink: true,
    })
    expect(ada?.references[0].url).toContain('#:~:text=9.10%20In%20adults')
    expect(taiwan?.references[0]).toMatchObject({
      recommendationId: '第15章 2',
      page: 194,
      printedPage: '189',
      url: '/clinical-guidelines/taiwan-t2dm-2022/2022-t2dm-guideline.pdf#page=194',
    })
  })

  it('provides exact ADA and Taiwan locations for every displayed decision', () => {
    const displayedRecommendations = [
      recommendation('complete-kidney-risk', 'monitoring'),
      recommendation('review-egfr-trajectory', 'monitoring'),
      recommendation('sglt2-concordance', 'medication'),
      recommendation('glycemic-safety-older-adult', 'target'),
      recommendation('blood-pressure-review', 'monitoring'),
      recommendation('kidney-medication-strategy', 'medication'),
      recommendation('ascvd-lipid-strategy', 'medication'),
      recommendation('complication-screening', 'complication'),
      recommendation('older-adult-safety', 'safety'),
      recommendation('care-gap-inventory', 'care-gap'),
    ]
    const result = attachKnowledgeAssessments({
      profile,
      locale: 'zh-TW',
      recommendations: displayedRecommendations,
    })

    for (const item of result.recommendations) {
      const ada = item.sourceAssessments?.find(
        (assessment) => assessment.sourceId === 'ada-2026',
      )
      const taiwan = item.sourceAssessments?.find(
        (assessment) => assessment.sourceId === 'taiwan-t2dm-2022',
      )

      expect(ada?.references.length).toBeGreaterThan(0)
      expect(taiwan?.references.length).toBeGreaterThan(0)
      expect(ada?.references.every(
        (reference) => reference.directLink
          && reference.recommendationId
          && reference.url.includes('#:~:text='),
      )).toBe(true)
      expect(taiwan?.references.every(
        (reference) => reference.page
          && reference.recommendationId
          && reference.url === `/clinical-guidelines/taiwan-t2dm-2022/2022-t2dm-guideline.pdf#page=${reference.page}`,
      )).toBe(true)
    }
  })
})
