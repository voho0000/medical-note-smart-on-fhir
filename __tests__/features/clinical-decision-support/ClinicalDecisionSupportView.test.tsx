import { fireEvent, render, screen, within } from '@testing-library/react'
import {
  buildClinicalDecisionSummary,
  ClinicalDecisionSupportView,
} from '@/features/clinical-decision-support/renderers/ClinicalDecisionSupportView'
import type {
  CdssRecommendation,
  CdssResult,
} from '@/features/clinical-decision-support/types'

function recommendation(
  id: string,
  input: Partial<CdssRecommendation> = {},
): CdssRecommendation {
  return {
    id,
    domain: 'monitoring',
    priority: 'medium',
    status: 'review',
    title: `決策 ${id}`,
    recommendation: `建議 ${id}`,
    rationale: `理由 ${id}`,
    patientEvidence: [],
    nextActions: [`下一步 ${id}`],
    guidelineReferences: [],
    safetyBoundary: `邊界 ${id}`,
    ...input,
  }
}

function result(): CdssResult {
  return {
    title: '慢性腎臟病個人化照護指引',
    summary: '本次產生 5 項 CKD 決策提示。',
    packId: 'ckd-cdss',
    packVersion: 'test',
    recommendations: [
      recommendation('high', {
        priority: 'high',
        status: 'actionable',
        title: '優先處置',
      }),
      recommendation('data-a', {
        priority: 'high',
        status: 'needs-data',
        title: '補資料 A',
        missingData: ['大於 0 的定量 UACR（mg/g）', '近期血壓', '近期血鉀'],
      }),
      recommendation('review', {
        status: 'review',
        title: '臨床確認',
      }),
      recommendation('data-b', {
        status: 'needs-data',
        title: '補資料 B',
        missingData: ['定量 UACR（mg/g）', '目前用藥', '照護目標'],
      }),
      recommendation('complete', {
        status: 'no-action',
        title: '已完成判讀',
      }),
    ],
    automatedChecks: [
      { id: 'check-1', label: '檢核一', value: '完成' },
      { id: 'check-2', label: '檢核二', value: '完成' },
    ],
    notEvaluated: [],
    disclaimer: '測試',
  }
}

describe('clinical decision summary', () => {
  it('separates actionable guidance from semantically deduplicated missing inputs', () => {
    const summary = buildClinicalDecisionSummary(result(), 'zh-TW')

    expect(summary.actionRecommendations.map((item) => item.id)).toEqual([
      'high',
      'review',
    ])
    expect(summary.missingInputs[0]).toEqual({
      label: '定量 UACR（mg/g；需為有效正值）',
      relatedRecommendationCount: 2,
    })
    expect(summary.missingInputs).toEqual([
      {
        label: '定量 UACR（mg/g；需為有效正值）',
        relatedRecommendationCount: 2,
      },
      { label: '近期血壓', relatedRecommendationCount: 1 },
      { label: '近期血鉀', relatedRecommendationCount: 1 },
      { label: '目前用藥', relatedRecommendationCount: 1 },
    ])
    expect(summary.missingInputCount).toBe(5)
    expect(summary.automatedCheckCount).toBe(2)
  })

  it('renders the summary before the detailed module list', () => {
    render(<ClinicalDecisionSupportView result={result()} locale="zh-TW" />)

    const view = screen.getByTestId('clinical-decision-support-view')
    const summary = screen.getByTestId('cdss-clinical-summary')

    expect(view.firstElementChild).toBe(summary)
    expect(summary).toHaveTextContent('臨床摘要')
    expect(summary).toHaveTextContent('需補資料')
    expect(summary).toHaveTextContent('建議處理')
    expect(summary).toHaveTextContent('優先處置')
    expect(summary).toHaveTextContent('下一步 high')
    expect(summary).toHaveTextContent('定量 UACR（mg/g；需為有效正值）')
    expect(summary).toHaveTextContent('同時影響 2 個決策模組')
    expect(summary).toHaveTextContent('另有 1 項，請見下方模組')
    expect(summary).not.toHaveTextContent('補資料 A')
    expect(summary).not.toHaveTextContent('補資料 B')
    expect(summary.textContent?.match(/定量 UACR/g)).toHaveLength(1)
    expect(within(summary).getByText('2 項已核對')).toBeInTheDocument()
  })

  it('keeps medication records behind a compact history control', () => {
    const medicationHistory: CdssResult = {
      ...result(),
      recommendations: [
        recommendation('statin-history', {
          overviewEvidenceFactKey: 'statinTherapy',
          patientEvidence: [{
            label: '系統核對 statin',
            value: '有歷史 statin 處方，近期是否持續未知：Rosuvastatin 10 mg（3 筆處方 · 最近 2025-05-20）',
            factKeys: ['statinTherapy'],
            sources: [
              {
                resourceType: 'MedicationRequest',
                resourceId: 'statin-1',
                date: '2025-03-20',
              },
              {
                resourceType: 'MedicationRequest',
                resourceId: 'statin-2',
                date: '2025-04-20',
              },
              {
                resourceType: 'MedicationRequest',
                resourceId: 'statin-3',
                date: '2025-05-20',
              },
            ],
          }],
        }),
      ],
    }

    render(<ClinicalDecisionSupportView result={medicationHistory} locale="zh-TW" />)
    fireEvent.click(screen.getByTestId('cdss-recommendation-trigger-statin-history'))

    const detail = screen.getByTestId('cdss-recommendation-detail-statin-history')
    expect(within(detail).getByText('用藥歷程 3 筆')).toBeInTheDocument()
  })
})
