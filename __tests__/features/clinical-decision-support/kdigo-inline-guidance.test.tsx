import { fireEvent, render, screen } from '@testing-library/react'
import { KDIGO_CKD_2024_PACK } from '@voho0000/personalized-care'
import { ClinicalDecisionSupportView } from '@/features/clinical-decision-support/renderers/ClinicalDecisionSupportView'
import type {
  CdssRecommendation,
  CdssResult,
} from '@/features/clinical-decision-support/types'

function kidneyFailureRiskRecommendation(): CdssRecommendation {
  return {
    id: 'ckd-kidney-failure-risk',
    domain: 'monitoring',
    priority: 'high',
    status: 'review',
    title: 'KFRE 腎衰竭風險',
    recommendation: '使用 KFRE 評估風險。',
    rationale: '依 CKD 分期與風險安排照護。',
    patientEvidence: [],
    nextActions: ['核對定量 UACR 後計算。'],
    guidelineReferences: [],
    safetyBoundary: '需配合完整病歷判讀。',
  }
}

function result(): CdssResult {
  const recommendation = kidneyFailureRiskRecommendation()
  const sourceAssessment = KDIGO_CKD_2024_PACK.assess({
    profile: {} as never,
    recommendation,
    locale: 'zh-TW',
  })

  return {
    title: '慢性腎臟病個人化照護指引',
    summary: '本次產生 1 項 CKD 決策提示。',
    packId: 'ckd-cdss',
    packVersion: 'test',
    recommendations: [{
      ...recommendation,
      sourceAssessments: [sourceAssessment],
    }],
    notEvaluated: [],
    disclaimer: '測試',
  }
}

describe('KDIGO kidney failure risk inline guidance', () => {
  it.each([
    'ckd-classification',
    'ckd-monitoring',
    'ckd-kidney-failure-risk',
    'ckd-blood-pressure-volume',
    'ckd-rasi-strategy',
    'ckd-sglt2-strategy',
    'ckd-finerenone-strategy',
    'ckd-cardiovascular-risk',
    'ckd-medication-safety',
    'ckd-nutrition',
    'ckd-referral-care',
    'ckd-potassium-acidosis',
  ])('provides cited original text for %s', (id) => {
    const assessment = KDIGO_CKD_2024_PACK.assess({
      profile: {} as never,
      recommendation: {
        ...kidneyFailureRiskRecommendation(),
        id,
      },
      locale: 'zh-TW',
    })

    expect(assessment.references[0]?.citedStatements?.length).toBeGreaterThan(0)
  })

  it('provides the cited original text for Recommendation 2.2.1 and Practice Points 2.2.1–2.2.4', () => {
    const recommendation = kidneyFailureRiskRecommendation()
    const assessment = KDIGO_CKD_2024_PACK.assess({
      profile: {} as never,
      recommendation,
      locale: 'zh-TW',
    })
    const reference = assessment.references[0]

    expect(reference.page).toBe(41)
    expect(reference.citedStatements?.map((statement) => statement.label)).toEqual([
      'Recommendation 2.2.1',
      'Practice Point 2.2.1',
      'Practice Point 2.2.2',
      'Practice Point 2.2.3',
      'Practice Point 2.2.4',
    ])
    expect(reference.citedStatements?.[0].text).toBe(
      'In people with CKD G3–G5, we recommend using an externally validated risk equation to estimate the absolute risk of kidney failure (1A).',
    )
    expect(reference.citedStatements?.[2].text).toContain('2-year kidney failure risk of >10%')
    expect(reference.citedStatements?.[3].text).toContain('2-year kidney failure risk threshold of >40%')
  })

  it('toggles the guidance points inline and keeps the official page link', () => {
    render(<ClinicalDecisionSupportView result={result()} locale="zh-TW" />)

    fireEvent.click(screen.getByTestId(
      'cdss-recommendation-trigger-ckd-kidney-failure-risk',
    ))

    const toggle = screen.getByTestId(
      'guideline-statement-toggle-KDIGO-CKD-2024-2.2.1',
    ) as HTMLDetailsElement
    expect(toggle.open).toBe(false)

    fireEvent.click(toggle.querySelector('summary')!)

    expect(toggle.open).toBe(true)
    expect(toggle).toHaveTextContent('Recommendation 2.2.1')
    expect(toggle).toHaveTextContent('Practice Point 2.2.4')
    expect(toggle).not.toHaveTextContent('僅顯示本卡引用的指引原文')
    expect(screen.getByRole('link', { name: /開啟官方原文第 41 頁/ })).toHaveAttribute(
      'href',
      expect.stringContaining('#page=41'),
    )
  })
})
