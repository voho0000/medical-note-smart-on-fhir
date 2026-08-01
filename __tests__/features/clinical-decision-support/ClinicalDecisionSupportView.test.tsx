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
    expect(within(summary).getByText('2 項無需處理')).toBeInTheDocument()
    expect(screen.queryByTestId('cdss-automated-checks')).not.toBeInTheDocument()
    expect(screen.getByTestId('cdss-automated-check-row-check-1')).toHaveTextContent('檢核一')
    expect(screen.getByTestId('cdss-automated-check-row-check-2')).toHaveTextContent('檢核二')
    expect(screen.getByTestId('cdss-limitations')).not.toHaveAttribute('open')
  })

  it('restores completed modules to their original list positions with a green background', () => {
    const completed = recommendation('ckd-monitoring', {
      priority: 'routine',
      status: 'no-action',
      title: '最近兩次 eGFR 變化 -3.0%，未超過 20%',
      recommendation: '目前資料已完成核對。',
    })
    const orderedResult: CdssResult = {
      ...result(),
      recommendations: [
        recommendation('first', { title: '第一個模組' }),
        recommendation('third', { title: '第三個模組' }),
      ],
      automatedChecks: [{
        id: completed.id,
        label: completed.title,
        value: completed.recommendation,
        recommendation: completed,
        displayOrder: 1,
      }],
    }

    render(<ClinicalDecisionSupportView result={orderedResult} locale="zh-TW" />)

    const overview = screen.getByLabelText('個案決策總覽')
    const moduleIds = Array.from(overview.querySelectorAll('article')).map(
      (element) => element.getAttribute('data-testid'),
    )
    expect(moduleIds).toEqual([
      'cdss-recommendation-first',
      'cdss-recommendation-ckd-monitoring',
      'cdss-recommendation-third',
    ])
    expect(screen.getByTestId('cdss-recommendation-ckd-monitoring')).toHaveClass('bg-emerald-50/50')
    const completedRow = screen.getByTestId('cdss-recommendation-trigger-ckd-monitoring')
    const moduleCell = screen.getByTestId('cdss-module-cell-ckd-monitoring')
    const evidencePreview = screen.getByTestId('cdss-evidence-preview-ckd-monitoring')
    const nextStepPreview = screen.getByTestId('cdss-next-step-preview-ckd-monitoring')
    expect(completedRow).toHaveTextContent('腎功能趨勢')
    expect(completedRow).toHaveTextContent('最近兩次 eGFR 變化 -3.0%，未超過 20%')
    expect(within(moduleCell).queryByText('目前無需處理')).not.toBeInTheDocument()
    expect(within(nextStepPreview).getByText('目前無需處理')).toBeInTheDocument()
    expect(within(evidencePreview).queryByText('目前無需處理')).not.toBeInTheDocument()
    expect(within(moduleCell).getByText('最近兩次 eGFR 變化 -3.0%，未超過 20%')).toHaveClass('line-clamp-1')
    expect(within(nextStepPreview).getByTitle('下一步 ckd-monitoring')).toHaveClass('line-clamp-2')
    expect(completedRow).not.toHaveTextContent('例行盤點')
    expect(completedRow).not.toHaveTextContent('優先處理')
    expect(completedRow).not.toHaveTextContent('接續檢視')

    fireEvent.click(completedRow)
    expect(screen.getByTestId('cdss-semantic-card-ckd-monitoring')).not.toHaveTextContent(
      '目前資料已完成核對。',
    )
    expect(screen.getByTestId('cdss-semantic-card-ckd-monitoring')).not.toHaveTextContent(
      '最近兩次 eGFR 變化 -3.0%，未超過 20%',
    )
  })

  it('does not repeat a missing concept in the collapsed row and preserves it in details', () => {
    const deduplicatedResult: CdssResult = {
      ...result(),
      recommendations: [
        recommendation('ckd-kidney-failure-risk', {
          status: 'needs-data',
          title: 'KFRE｜G3b：缺少定量 UACR 或數值無法使用',
          overviewEvidenceFactKey: 'urineAlbuminOverview',
          patientEvidence: [{
            label: '尿白蛋白',
            value: '1+ (80) · 2026-01-14',
            factKeys: ['urineAlbuminOverview'],
          }],
          missingData: ['大於 0 的定量 UACR（mg/g）'],
        }),
        recommendation('ckd-blood-pressure-volume', {
          status: 'needs-data',
          title: '缺少近期可判讀的血壓與體液狀態',
          overviewEvidenceFactKey: 'bloodPressure',
          patientEvidence: [{
            label: '近期血壓',
            value: '154/88 mmHg（2018-02-12）',
            factKeys: ['bloodPressure'],
          }],
          missingData: ['標準化診間血壓與量測日期'],
        }),
        recommendation('ckd-rasi-strategy', {
          status: 'review',
          title: '有 ACEI／ARB 歷史處方，近期是否持續未知；最後處方 2026-04-25',
          overviewEvidenceFactKey: 'aceArbTherapy',
          patientEvidence: [{
            label: 'ACEI／ARB',
            value: '有歷史 ACEI／ARB 處方，近期是否持續未知：得安穩膜衣錠160毫克（4 筆處方 · 最近 2026-04-25）',
            factKeys: ['aceArbTherapy'],
          }],
          missingData: ['目前實際使用、既往耐受性與停藥原因'],
        }),
      ],
      automatedChecks: [],
    }

    render(<ClinicalDecisionSupportView result={deduplicatedResult} locale="zh-TW" />)

    const kfreRow = screen.getByTestId('cdss-recommendation-trigger-ckd-kidney-failure-risk')
    const bloodPressureRow = screen.getByTestId('cdss-recommendation-trigger-ckd-blood-pressure-volume')
    const rasRow = screen.getByTestId('cdss-recommendation-trigger-ckd-rasi-strategy')
    const rasModuleCell = screen.getByTestId('cdss-module-cell-ckd-rasi-strategy')
    const rasEvidencePreview = screen.getByTestId('cdss-evidence-preview-ckd-rasi-strategy')

    expect(kfreRow).toHaveTextContent('缺少定量 UACR')
    expect(kfreRow).not.toHaveTextContent('缺：大於 0 的定量 UACR')
    expect(within(kfreRow).getByTitle('KFRE｜G3b：缺少定量 UACR 或數值無法使用')).toBeInTheDocument()
    expect(bloodPressureRow).toHaveTextContent('缺少近期可判讀的血壓與體液狀態')
    expect(bloodPressureRow).not.toHaveTextContent('缺：標準化診間血壓與量測日期')
    expect(rasModuleCell).not.toHaveTextContent('有 ACEI／ARB 歷史處方，近期是否持續未知')
    expect(rasEvidencePreview).toHaveTextContent('有歷史 ACEI／ARB 處方，近期是否持續未知')
    expect(within(rasEvidencePreview).getByTitle(
      'ACEI／ARB：有歷史 ACEI／ARB 處方，近期是否持續未知：得安穩膜衣錠160毫克（4 筆處方 · 最近 2026-04-25）',
    )).toBeInTheDocument()
    expect(rasRow).toHaveTextContent('缺：目前實際使用、既往耐受性與停藥原因')
    expect(within(screen.getByTestId('cdss-next-step-preview-ckd-rasi-strategy')).getByTitle(
      '下一步 ckd-rasi-strategy',
    )).toBeInTheDocument()

    fireEvent.click(kfreRow)
    expect(screen.getByTestId('cdss-action-plan-ckd-kidney-failure-risk')).toHaveTextContent(
      '大於 0 的定量 UACR（mg/g）',
    )
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

  it('keeps the primary guideline card visible and places other sources and safety notes behind one toggle', () => {
    const semanticResult: CdssResult = {
      ...result(),
      recommendations: [
        recommendation('sglt2-semantic', {
          domain: 'medication',
          status: 'needs-data',
          recommendation: '目前缺少定量 UACR，尚不能完成 SGLT2 抑制劑適用性判斷。',
          rationale: '需將 eGFR、UACR 與心衰竭狀態一起判讀。',
          sourceAssessments: [{
            sourceId: 'kdigo-ckd-2024',
            sourceKind: 'guideline',
            sourceLabel: 'KDIGO CKD 指引',
            version: '2024',
            effectiveFrom: '2024-03-13',
            status: 'needs-data',
            summary: '依 KDIGO 評估。',
            references: [{
              id: 'KDIGO-CKD-2024-3.7',
              title: 'KDIGO 2024 CKD Guideline',
              publisher: 'KDIGO',
              version: '2024',
              url: 'https://kdigo.org/',
              recommendationId: 'Recommendations 3.7.2–3.7.3',
              evidenceGrade: '1A / 2B',
              summary: 'eGFR ≥20 且 UACR ≥200 mg/g，或合併心衰竭時，建議使用 SGLT2 抑制劑。',
            }],
          }],
        }),
      ],
    }

    render(<ClinicalDecisionSupportView result={semanticResult} locale="zh-TW" />)
    fireEvent.click(screen.getByTestId('cdss-recommendation-trigger-sglt2-semantic'))

    const semanticCard = screen.getByTestId('cdss-semantic-card-sglt2-semantic')
    expect(within(semanticCard).getByText('指引用藥條件')).toBeInTheDocument()
    expect(semanticCard).toHaveTextContent('KDIGO CKD 指引 · 2024')
    expect(semanticCard).toHaveTextContent('1A / 2B')
    expect(semanticCard).toHaveTextContent('eGFR ≥20 且 UACR ≥200 mg/g')
    expect(semanticCard).not.toHaveTextContent('資料不足')
    expect(semanticCard).not.toHaveTextContent('目前缺少定量 UACR')
    expect(semanticCard).not.toHaveTextContent('需將 eGFR、UACR 與心衰竭狀態一起判讀')
    expect(semanticCard).not.toHaveTextContent('Recommendations 3.7.2–3.7.3')

    const supporting = screen.getByTestId('cdss-supporting-context-sglt2-semantic')
    expect(supporting).not.toHaveAttribute('open')
    fireEvent.click(within(supporting).getByText('其他來源與安全提醒'))
    expect(supporting).toHaveAttribute('open')
    expect(supporting).toHaveTextContent('需將 eGFR、UACR 與心衰竭狀態一起判讀')
    expect(supporting).toHaveTextContent('Recommendations 3.7.2–3.7.3')
    expect(supporting).toHaveTextContent('等級 1A / 2B')
    expect(supporting).toHaveTextContent('eGFR ≥20 且 UACR ≥200 mg/g')
    expect(supporting).toHaveTextContent('邊界 sglt2-semantic')
  })

  it('uses type-specific headings inside CKD semantic cards', () => {
    const groupedResult: CdssResult = {
      ...result(),
      recommendations: [
        recommendation('ckd-classification', { domain: 'diagnosis' }),
        recommendation('ckd-rasi-strategy', { domain: 'medication' }),
        recommendation('ckd-monitoring', { domain: 'monitoring' }),
        recommendation('ckd-medication-safety', { domain: 'safety' }),
        recommendation('ckd-nutrition', { domain: 'target' }),
      ],
      automatedChecks: [],
    }

    render(<ClinicalDecisionSupportView result={groupedResult} locale="zh-TW" />)

    const cases = [
      ['ckd-classification', '分級／風險依據'],
      ['ckd-rasi-strategy', '指引用藥條件'],
      ['ckd-monitoring', '監測依據／門檻'],
      ['ckd-medication-safety', '監測依據／門檻'],
      ['ckd-nutrition', '指引建議'],
    ] as const

    cases.forEach(([id, guidelineHeading]) => {
      fireEvent.click(screen.getByTestId(`cdss-recommendation-trigger-${id}`))
      const card = screen.getByTestId(`cdss-semantic-card-${id}`)
      expect(card).toHaveTextContent(guidelineHeading)
      expect(card).not.toHaveTextContent('本次')
    })
  })

  it('groups CKD modules in a fixed workflow order and toggles each group independently', () => {
    const groupedResult: CdssResult = {
      ...result(),
      recommendations: [
        recommendation('ckd-classification', { moduleGroup: 'assessment' }),
        recommendation('ckd-monitoring', { moduleGroup: 'monitoring' }),
        recommendation('ckd-kidney-failure-risk', { moduleGroup: 'assessment' }),
        recommendation('ckd-blood-pressure-volume', { moduleGroup: 'monitoring' }),
        recommendation('ckd-rasi-strategy', { moduleGroup: 'treatment' }),
        recommendation('ckd-sglt2-strategy', { moduleGroup: 'treatment' }),
        recommendation('ckd-finerenone-strategy', { moduleGroup: 'treatment' }),
        recommendation('ckd-cardiovascular-risk', { moduleGroup: 'treatment' }),
        recommendation('ckd-medication-safety', { moduleGroup: 'monitoring' }),
        recommendation('ckd-anemia-monitoring', { moduleGroup: 'monitoring' }),
        recommendation('ckd-potassium-acidosis', { moduleGroup: 'monitoring' }),
        recommendation('ckd-mbd-monitoring', { moduleGroup: 'monitoring' }),
        recommendation('ckd-nutrition', { moduleGroup: 'care' }),
        recommendation('immunization-review', { moduleGroup: 'care' }),
        recommendation('ckd-referral-care', { moduleGroup: 'care' }),
      ],
      automatedChecks: [],
    }

    render(<ClinicalDecisionSupportView result={groupedResult} locale="zh-TW" />)

    const groupTriggers = screen.getAllByTestId(/^cdss-module-group-trigger-/)
    expect(groupTriggers.map((trigger) => trigger.textContent?.replace(/\s/g, ''))).toEqual([
      '評估與分層·2',
      '治療決策·4',
      '監測與安全·6',
      '照護安排·3',
    ])
    expect(groupTriggers.every((trigger) => trigger.getAttribute('aria-expanded') === 'true')).toBe(true)
    expect(groupTriggers.every((trigger) => trigger.classList.contains('h-6'))).toBe(true)
    expect(groupTriggers.every((trigger) => !trigger.classList.contains('bg-muted/30'))).toBe(true)
    const groupTones = [
      ['assessment', 'text-blue-700', 'bg-blue-200/90'],
      ['treatment', 'text-violet-700', 'bg-violet-200/90'],
      ['monitoring', 'text-teal-700', 'bg-teal-200/90'],
      ['care', 'text-orange-700', 'bg-orange-200/90'],
    ] as const
    groupTones.forEach(([id, toneClass, dividerClass]) => {
      expect(screen.getByTestId(`cdss-module-group-tone-${id}`)).toHaveClass(toneClass)
      expect(screen.getByTestId(`cdss-module-group-divider-${id}`)).toHaveClass(dividerClass)
    })

    const overview = screen.getByLabelText('個案決策總覽')
    const moduleIds = Array.from(overview.querySelectorAll('article')).map(
      (element) => element.getAttribute('data-testid'),
    )
    expect(moduleIds).toEqual([
      'cdss-recommendation-ckd-classification',
      'cdss-recommendation-ckd-kidney-failure-risk',
      'cdss-recommendation-ckd-rasi-strategy',
      'cdss-recommendation-ckd-sglt2-strategy',
      'cdss-recommendation-ckd-finerenone-strategy',
      'cdss-recommendation-ckd-cardiovascular-risk',
      'cdss-recommendation-ckd-monitoring',
      'cdss-recommendation-ckd-blood-pressure-volume',
      'cdss-recommendation-ckd-medication-safety',
      'cdss-recommendation-ckd-anemia-monitoring',
      'cdss-recommendation-ckd-potassium-acidosis',
      'cdss-recommendation-ckd-mbd-monitoring',
      'cdss-recommendation-ckd-nutrition',
      'cdss-recommendation-immunization-review',
      'cdss-recommendation-ckd-referral-care',
    ])

    const monitoringTrigger = screen.getByTestId('cdss-module-group-trigger-monitoring')
    fireEvent.click(monitoringTrigger)
    expect(monitoringTrigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('cdss-recommendation-ckd-monitoring')).not.toBeInTheDocument()
    expect(screen.getByTestId('cdss-recommendation-ckd-rasi-strategy')).toBeInTheDocument()

    fireEvent.click(monitoringTrigger)
    expect(monitoringTrigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('cdss-recommendation-ckd-monitoring')).toBeInTheDocument()
  })

  it('renders evidence as one consistent list and groups confirmation items with next steps', () => {
    const evidenceLayout: CdssResult = {
      ...result(),
      recommendations: [
        recommendation('evidence-layout', {
          patientEvidence: [
            {
              label: 'ASCVD',
              value: '慢性缺血性心臟病（2026-02-10）',
              factKeys: ['ascvdDiagnosis'],
              sources: [{
                resourceType: 'Condition',
                resourceId: 'ascvd-1',
                date: '2026-02-10',
              }],
            },
            {
              label: 'Statin',
              value: '現有資料未見 statin',
              factKeys: ['statinTherapy'],
            },
          ],
          missingData: ['LDL-C 與採檢日期'],
        }),
      ],
    }

    render(<ClinicalDecisionSupportView result={evidenceLayout} locale="zh-TW" />)
    fireEvent.click(screen.getByTestId('cdss-recommendation-trigger-evidence-layout'))

    const evidence = screen.getByTestId('cdss-patient-evidence-evidence-layout')
    const actionPlan = screen.getByTestId('cdss-action-plan-evidence-layout')

    expect(within(evidence).getByText('ASCVD')).toBeInTheDocument()
    expect(within(evidence).getByText('Statin')).toBeInTheDocument()
    expect(within(evidence).getByRole('button', {
      name: '在左側開啟來源紀錄',
    })).toHaveTextContent('查看來源')
    expect(within(actionPlan).getByText('尚待確認')).toBeInTheDocument()
    expect(within(actionPlan).getByText('LDL-C 與採檢日期')).toBeInTheDocument()
    expect(within(actionPlan).getByText('下一步 evidence-layout')).toBeInTheDocument()
  })
})
