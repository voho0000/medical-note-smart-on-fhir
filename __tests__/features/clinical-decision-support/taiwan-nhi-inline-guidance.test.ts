import { TAIWAN_NHI_DIABETES_PACK } from '@voho0000/personalized-care'
import type {
  CdssPatientProfile,
  CdssRecommendation,
} from '@/features/clinical-decision-support/types'

function recommendation(
  id: string,
  domain: CdssRecommendation['domain'] = 'medication',
): CdssRecommendation {
  return {
    id,
    domain,
    priority: 'medium',
    status: 'review',
    title: '測試',
    recommendation: '測試',
    rationale: '測試',
    patientEvidence: [],
    nextActions: [],
    guidelineReferences: [],
    safetyBoundary: '測試',
  }
}

function assess(
  id: string,
  profile: Partial<CdssPatientProfile> = {},
) {
  return TAIWAN_NHI_DIABETES_PACK.assess({
    profile: {
      facts: {},
      ...profile,
    } as CdssPatientProfile,
    recommendation: recommendation(id),
    locale: 'zh-TW',
  })
}

describe('Taiwan NHI inline cited coverage text', () => {
  it('provides the cited SGLT-2 product limits and CKD coverage conditions', () => {
    const references = assess('ckd-sglt2-strategy').references

    expect(references[0]).toMatchObject({
      recommendationId: '5.1.5',
      page: 3,
      citedStatements: expect.arrayContaining([
        expect.objectContaining({
          label: '5.1.5（1）',
          text: expect.stringContaining('每日最多處方1粒'),
        }),
      ]),
    })
    expect(references[1]).toMatchObject({
      recommendationId: '2.16',
      page: 20,
      citedStatements: [{
        label: '2.16（2.慢性腎臟病）',
        text: expect.stringContaining('uACR≧200且≦5000/mg/g'),
      }],
    })
    expect(references[1].citedStatements?.[0].text).toContain(
      '穩定接受最大耐受劑量的 ACEI 或 ARB 至少4週',
    )
    expect(references[1].citedStatements?.[0].text).toContain(
      '使用後 eGFR 下降至<15mL/min/1.73m2，應予停藥',
    )
  })

  it('provides the cited diabetes/cardiovascular lipid row and follow-up rule', () => {
    const reference = assess('ckd-cardiovascular-risk').references[0]

    expect(reference).toMatchObject({
      recommendationId: '2.6.1',
      page: 10,
      citedStatements: [{
        label: '2.6.1（心血管疾病或糖尿病患者）',
        text: expect.stringContaining('TC≧160mg/dL 或 LDL-C≧100mg/dL'),
      }],
    })
    expect(reference.citedStatements?.[0].text).toContain(
      '第一年應每3-6個月抽血檢查一次',
    )
  })

  it('reuses the exact CKD prerequisite text on the ACEI/ARB coverage path', () => {
    const reference = assess('ckd-rasi-strategy', {
      coverageContexts: {
        taiwanNhiSglt2: {
          indicationRoute: 'ckd',
        },
      } as CdssPatientProfile['coverageContexts'],
    }).references[0]

    expect(reference.recommendationId).toBe('2.16')
    expect(reference.citedStatements?.[0].text).toContain(
      'ACEI 或 ARB 至少4週',
    )
  })
})
