import { TAIWAN_CKD_2025_PACK } from '@voho0000/personalized-care'
import type { CdssRecommendation } from '@/features/clinical-decision-support/types'

function recommendation(id: string): CdssRecommendation {
  return {
    id,
    domain: 'monitoring',
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

function references(id: string) {
  return TAIWAN_CKD_2025_PACK.assess({
    profile: {} as never,
    recommendation: recommendation(id),
    locale: 'zh-TW',
  }).references
}

describe('Taiwan CKD inline cited guidance', () => {
  it('provides the cited A4 staging statement', () => {
    expect(references('ckd-classification')[0]).toMatchObject({
      recommendationId: 'A4-1-1',
      page: 49,
      citedStatements: [{
        label: 'A4-1-1',
        text: expect.stringContaining('應根據病因、GFR 和尿液白蛋白與尿液肌酸酐比值進行分期'),
      }],
    })
  })

  it('provides both cited SGLT2i statements', () => {
    const reference = references('ckd-sglt2-strategy')[0]

    expect(reference.citedStatements?.map((statement) => statement.label)).toEqual([
      'A8-1-4-1',
      'A8-1-4-2',
    ])
    expect(reference.citedStatements?.[0].text).toContain('第 2 型糖尿病患者')
    expect(reference.citedStatements?.[1].text).toContain('非第 2 型糖尿病 CKD 患者')
  })

  it('provides the cited referral and multidisciplinary-care statements', () => {
    const [referral, multidisciplinaryCare] = references('ckd-kidney-failure-risk')

    expect(referral.citedStatements?.[0].text).toContain('兩年內進入末期腎病高風險')
    expect(referral.citedStatements?.[0].text).toContain('9.')
    expect(multidisciplinaryCare.citedStatements?.map((statement) => statement.label)).toEqual([
      'A9-2-1',
      'A9-2-2',
    ])
  })

  it('narrows the anemia citation to B4-1-1–B4-1-4 and provides the original text', () => {
    const reference = references('ckd-anemia-monitoring')[0]

    expect(reference.recommendationId).toBe('B4-1-1 to B4-1-4')
    expect(reference.citedStatements?.map((statement) => statement.label)).toEqual([
      'B4-1-1',
      'B4-1-2',
      'B4-1-3',
      'B4-1-4',
    ])
    expect(reference.citedStatements?.[1].text).toContain('網狀紅血球數、鐵蛋白、運鐵蛋白飽和度')
  })
})
