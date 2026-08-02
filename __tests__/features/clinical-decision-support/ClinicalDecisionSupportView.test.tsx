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
    expect(summary).not.toHaveAttribute('open')
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
    expect(summary).not.toHaveTextContent('項無需處理')
    expect(screen.queryByTestId('cdss-automated-checks')).not.toBeInTheDocument()
    expect(screen.getByTestId('cdss-automated-check-row-check-1')).toHaveTextContent('檢核一')
    expect(screen.getByTestId('cdss-automated-check-row-check-2')).toHaveTextContent('檢核二')
    expect(screen.getByTestId('cdss-limitations')).not.toHaveAttribute('open')

    fireEvent.click(screen.getByTestId('cdss-clinical-summary-trigger'))
    expect(summary).toHaveAttribute('open')
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
    expect(within(moduleCell).getByText('最近兩次 eGFR 變化 -3.0%，未超過 20%')).toHaveClass(
      'truncate',
      'whitespace-nowrap',
    )
    const nextStepTooltipTrigger = within(nextStepPreview).getByTestId(
      'cdss-next-step-tooltip-trigger-ckd-monitoring',
    )
    expect(nextStepTooltipTrigger).toHaveClass('line-clamp-2', 'cursor-help')
    expect(nextStepTooltipTrigger).not.toHaveAttribute('title')
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

  it('omits a redundant next-step block when status and evidence already convey the result', () => {
    const noAction = recommendation('prescription-recorded', {
      status: 'no-action',
      title: '已有 SGLT2i 處方',
      recommendation: '系統已辨識處方。',
      nextActions: [],
    })
    render(<ClinicalDecisionSupportView
      result={{
        ...result(),
        recommendations: [noAction],
        automatedChecks: [],
      }}
      locale="zh-TW"
    />)

    const row = screen.getByTestId('cdss-recommendation-trigger-prescription-recorded')
    expect(row).toHaveTextContent('目前無需處理')
    expect(row).not.toHaveTextContent('目前無需另加提示')

    fireEvent.click(row)
    expect(screen.queryByTestId('cdss-action-plan-prescription-recorded')).not.toBeInTheDocument()
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
          nextActions: ['查找或補做必要輸入；資料完整且腎功能穩定後再計算。'],
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
          title: 'A2 白蛋白尿符合 ACEI／ARB 條件',
          overviewEvidenceFactKey: 'aceArbTherapy',
          patientEvidence: [{
            label: 'ACEI／ARB',
            value: '歷史處方：得安穩膜衣錠160毫克（4 筆處方 · 最近 2026-04-25）',
            factKeys: ['aceArbTherapy'],
          }],
          missingData: ['續方適應症與既往停藥原因'],
          nextActions: ['依最後處方日期與目前適應症評估是否續方。'],
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
    const kfreAssessmentTooltip = within(kfreRow).getByTestId(
      'cdss-assessment-tooltip-trigger-ckd-kidney-failure-risk',
    )
    expect(kfreAssessmentTooltip).toHaveTextContent('KFRE｜G3b：缺少定量 UACR 或數值無法使用')
    expect(kfreAssessmentTooltip).not.toHaveAttribute('title')
    expect(bloodPressureRow).toHaveTextContent('缺少近期可判讀的血壓與體液狀態')
    expect(bloodPressureRow).not.toHaveTextContent('缺：標準化診間血壓與量測日期')
    expect(rasModuleCell).toHaveTextContent('A2 白蛋白尿符合 ACEI／ARB 條件')
    expect(rasModuleCell).not.toHaveTextContent('歷史處方')
    expect(rasEvidencePreview).toHaveTextContent('歷史處方')
    const rasEvidenceTooltip = within(rasEvidencePreview).getByTestId(
      'cdss-evidence-tooltip-trigger-ckd-rasi-strategy',
    )
    expect(rasEvidenceTooltip).toHaveTextContent(
      'ACEI／ARB：歷史處方：得安穩膜衣錠160毫克（4 筆處方 · 最近 2026-04-25）',
    )
    expect(rasEvidenceTooltip).not.toHaveAttribute('title')
    expect(rasRow).toHaveTextContent('缺：續方適應症與既往停藥原因')
    expect(within(screen.getByTestId('cdss-next-step-preview-ckd-rasi-strategy')).getByTestId(
      'cdss-next-step-tooltip-trigger-ckd-rasi-strategy',
    )).toHaveTextContent('依最後處方日期與目前適應症評估是否續方。')

    fireEvent.click(kfreRow)
    const kfreActionPlan = screen.getByTestId('cdss-action-plan-ckd-kidney-failure-risk')
    expect(kfreActionPlan).not.toHaveTextContent('尚待確認')
    expect(kfreActionPlan).toHaveTextContent(
      '查找或補做大於 0 的定量 UACR（mg/g）；資料完整且腎功能穩定後再計算。',
    )
  })

  it('provides nearby tooltips for truncated CKD-MBD evidence and missing items', () => {
    render(<ClinicalDecisionSupportView
      result={{
        ...result(),
        recommendations: [
          recommendation('ckd-mbd-monitoring', {
            status: 'needs-data',
            moduleName: 'CKD-MBD 監測',
            title: 'G3b CKD-MBD 評估尚缺 1 項',
            overviewEvidenceFactKey: 'eGFR',
            patientEvidence: [{
              label: '最新 eGFR',
              value: '32 mL/min/1.73m²（2026-06-02）',
              factKeys: ['eGFR'],
            }],
            missingData: ['PTH'],
            nextActions: ['先查既有結果；依分期補齊缺項並以連續趨勢判讀。'],
            guidelineReferences: [{
              id: 'KDIGO-CKD-MBD-2017-4.1.1',
              title: 'KDIGO 2017 Clinical Practice Guideline Update for CKD-MBD',
              publisher: 'Kidney Disease: Improving Global Outcomes',
              version: '2017',
              url: 'https://kdigo.org/ckd-mbd/',
              recommendationId: 'Recommendation 4.1.1',
              locator: '第 4.1 節 → CKD-MBD 生化異常',
              summary: 'CKD G3a–G5D 的處置應依連續的血磷、血鈣與 PTH 整體判讀。',
            }],
            sourceAssessments: [
              {
                sourceId: 'kdigo-ckd-2024',
                sourceKind: 'guideline',
                sourceLabel: 'KDIGO CKD 指引',
                version: '2024',
                effectiveFrom: '2024-03-13',
                status: 'needs-data',
                summary: '通用 CKD 樣板摘要。',
                references: [],
              },
              {
                sourceId: 'taiwan-ckd-2025',
                sourceKind: 'guideline',
                sourceLabel: '台灣 CKD 指引',
                version: '2025-12 update',
                effectiveFrom: '2025-12-01',
                status: 'needs-data',
                summary: '通用台灣 CKD 樣板摘要。',
                references: [],
              },
            ],
          }),
        ],
        automatedChecks: [],
      }}
      locale="zh-TW"
    />)

    const row = screen.getByTestId('cdss-recommendation-trigger-ckd-mbd-monitoring')
    const moduleTooltip = within(row).getByTestId('cdss-module-tooltip-trigger-ckd-mbd-monitoring')
    const assessmentTooltip = within(row).getByTestId('cdss-assessment-tooltip-trigger-ckd-mbd-monitoring')
    const evidenceTooltip = within(row).getByTestId('cdss-evidence-tooltip-trigger-ckd-mbd-monitoring')
    const missingTooltip = within(row).getByTestId('cdss-missing-tooltip-trigger-ckd-mbd-monitoring')
    const nextStepTooltip = within(row).getByTestId('cdss-next-step-tooltip-trigger-ckd-mbd-monitoring')

    expect(moduleTooltip).toHaveTextContent('CKD-MBD 監測')
    expect(assessmentTooltip).toHaveTextContent('G3b CKD-MBD 評估尚缺 1 項')
    expect(evidenceTooltip).toHaveTextContent('最新 eGFR：32（2026-06-02）')
    expect(evidenceTooltip).not.toHaveTextContent('mL/min/1.73m²')
    expect(missingTooltip).toHaveTextContent('缺：PTH')
    expect(nextStepTooltip).toHaveTextContent('先查既有結果；依分期補齊缺項並以連續趨勢判讀。')
    expect(assessmentTooltip).toHaveClass('truncate', 'whitespace-nowrap')
    expect(evidenceTooltip).toHaveClass('truncate', 'whitespace-nowrap')
    expect(missingTooltip).toHaveClass('truncate', 'whitespace-nowrap')
    expect(evidenceTooltip).not.toHaveClass('line-clamp-1')
    ;[moduleTooltip, assessmentTooltip, evidenceTooltip, missingTooltip, nextStepTooltip]
      .forEach((trigger) => expect(trigger).not.toHaveAttribute('title'))

    fireEvent.click(row)
    const supporting = screen.getByTestId('cdss-supporting-context-ckd-mbd-monitoring')
    expect(supporting).toHaveTextContent('KDIGO CKD-MBD 指引')
    expect(supporting).toHaveTextContent('2017')
    expect(supporting).toHaveTextContent('Recommendation 4.1.1')
    expect(supporting).toHaveTextContent('第 4.1 節 → CKD-MBD 生化異常')
    expect(supporting).not.toHaveTextContent('KDIGO CKD 指引')
    expect(supporting).not.toHaveTextContent('台灣 CKD 指引')
    expect(supporting).not.toHaveTextContent('通用 CKD 樣板摘要')
  })

  it('moves monitoring lab values from the assessment into key evidence', () => {
    render(<ClinicalDecisionSupportView
      result={{
        ...result(),
        recommendations: [
          recommendation('ckd-potassium-acidosis', {
            status: 'no-action',
            moduleName: '血鉀與酸鹼',
            presentationType: 'monitoring',
            title: '鉀與酸鹼數值已判讀；總 CO₂ 23.6 mmol/L未觸發重要酸中毒提示',
            overviewEvidenceFactKey: 'potassium',
            patientEvidence: [
              {
                label: '血鉀',
                value: '3.7 mmol/L（2026-06-02）',
                factKeys: ['potassium'],
              },
              {
                label: '總 CO₂',
                value: '23.6 mmol/L（2026-06-02）',
                factKeys: ['bicarbonate'],
              },
            ],
            nextActions: ['依既有計畫追蹤。'],
          }),
        ],
        automatedChecks: [],
      }}
      locale="zh-TW"
    />)

    const moduleCell = screen.getByTestId('cdss-module-cell-ckd-potassium-acidosis')
    const evidencePreview = screen.getByTestId('cdss-evidence-preview-ckd-potassium-acidosis')

    expect(moduleCell).toHaveTextContent('鉀與酸鹼數值已判讀；未觸發重要酸中毒提示')
    expect(moduleCell).not.toHaveTextContent('23.6 mmol/L')
    expect(evidencePreview).toHaveTextContent('血鉀：3.7 mmol/L（2026-06-02）')
    expect(evidencePreview).toHaveTextContent('總 CO₂：23.6 mmol/L（2026-06-02）')
    expect(within(evidencePreview).getByTestId(
      'cdss-evidence-tooltip-trigger-ckd-potassium-acidosis-bicarbonate',
    )).toHaveClass('truncate', 'whitespace-nowrap')
  })

  it('keeps medication records behind a compact history control', () => {
    const medicationHistory: CdssResult = {
      ...result(),
      recommendations: [
        recommendation('statin-history', {
          overviewEvidenceFactKey: 'statinTherapy',
          patientEvidence: [{
            label: '系統核對 statin',
            value: '歷史處方：Rosuvastatin 10 mg（3 筆處方 · 最近 2025-05-20）',
            factKeys: ['statinTherapy'],
            sources: [
              {
                resourceType: 'MedicationRequest',
                resourceId: 'statin-1',
                date: '2025-03-20',
                facility: '院所 A',
                value: 'ROSUVASTATIN 10 MG',
              },
              {
                resourceType: 'MedicationRequest',
                resourceId: 'statin-2',
                date: '2025-04-20',
                facility: '院所 A',
                value: 'ROSUVASTATIN 10 MG',
              },
              {
                resourceType: 'MedicationRequest',
                resourceId: 'statin-3',
                date: '2025-05-20',
                facility: '院所 B',
                value: 'ROSUVASTATIN 10 MG',
              },
            ],
          }],
        }),
      ],
    }

    render(<ClinicalDecisionSupportView result={medicationHistory} locale="zh-TW" />)
    fireEvent.click(screen.getByTestId('cdss-recommendation-trigger-statin-history'))

    const detail = screen.getByTestId('cdss-recommendation-detail-statin-history')
    const sourceToggle = within(detail).getByText('查看全部資料來源')
    expect(sourceToggle).toBeInTheDocument()
    fireEvent.click(sourceToggle)
    expect(within(detail).getByText(
      '2025-05-20 · 院所 B ｜ ROSUVASTATIN 10 MG',
    )).toHaveAttribute('title', '2025-05-20 · 院所 B ｜ ROSUVASTATIN 10 MG')
  })

  it('keeps the primary guideline card visible and places other sources and safety notes behind one toggle', () => {
    const semanticResult: CdssResult = {
      ...result(),
      recommendations: [
        recommendation('sglt2-semantic', {
          domain: 'medication',
          status: 'needs-data',
          recommendation: '目前缺少定量 UACR，尚不能完成 SGLT2i 適用性判斷。',
          rationale: '需將 eGFR、UACR 與心衰竭狀態一起判讀。',
          sourceAssessments: [
            {
              sourceId: 'kdigo-ckd-2024',
              sourceKind: 'guideline',
              sourceLabel: 'KDIGO CKD 指引',
              version: '2024',
              effectiveFrom: '2024-03-13',
              status: 'needs-data',
              summary: '依 KDIGO 評估。',
              verifiedData: ['eGFR 32 mL/min/1.73m²'],
              missingData: ['近期定量 UACR（mg/g）'],
              references: [{
                id: 'KDIGO-CKD-2024-3.7',
                title: 'KDIGO 2024 CKD Guideline',
                publisher: 'KDIGO',
                version: '2024',
                url: 'https://kdigo.org/',
                recommendationId: 'Recommendations 3.7.2–3.7.3',
                evidenceGrade: '1A / 2B',
                summary: 'eGFR ≥20 且 UACR ≥200 mg/g，或合併心衰竭時，建議使用 SGLT2i。',
              }],
            },
            {
              sourceId: 'taiwan-ckd-2025',
              sourceKind: 'guideline',
              sourceLabel: '台灣 CKD 指引',
              version: '2025-12 update',
              effectiveFrom: '2025-12-01',
              status: 'needs-data',
              summary: '依台灣 CKD 指引評估。',
              missingData: ['近期定量 UACR（mg/g）'],
              references: [{
                id: 'TW-CKD-2025-A4-1-1',
                title: '台灣慢性腎臟病臨床診療指引',
                publisher: '台灣腎臟醫學會',
                version: '2025-12 update',
                url: 'https://www.tsn.org.tw/',
                recommendationId: 'A4-1-1',
                page: 49,
                summary: '依 GFR 與白蛋白尿分級安排追蹤。',
              }],
            },
          ],
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
    expect(supporting).toHaveAttribute('open')
    fireEvent.click(within(supporting).getByText('指引來源與限制'))
    expect(supporting).not.toHaveAttribute('open')
    fireEvent.click(within(supporting).getByText('指引來源與限制'))
    expect(supporting).toHaveAttribute('open')
    expect(supporting).toHaveTextContent('指引來源')
    expect(supporting).toHaveTextContent('KDIGO CKD 指引')
    expect(supporting).toHaveTextContent('台灣 CKD 指引')
    expect(screen.getByTestId('cdss-source-comparison-sglt2-semantic')).toHaveClass(
      '@min-[38rem]:grid-cols-2',
    )
    expect(supporting).toHaveTextContent('Recommendations 3.7.2–3.7.3')
    expect(supporting).toHaveTextContent('A4-1-1 · 第 49 頁')
    expect(supporting).toHaveTextContent('等級 1A / 2B')
    expect(supporting).toHaveTextContent('eGFR ≥20 且 UACR ≥200 mg/g')
    expect(supporting).toHaveTextContent('邊界 sglt2-semantic')
    expect(supporting).not.toHaveTextContent('臨床結論')
    expect(supporting).not.toHaveTextContent('判斷方式')
    expect(supporting).not.toHaveTextContent('需將 eGFR、UACR 與心衰竭狀態一起判讀')
    expect(supporting).not.toHaveTextContent('依 KDIGO 評估')
    expect(supporting).not.toHaveTextContent('待補資料')
    expect(supporting).not.toHaveTextContent('還需：')
    expect(supporting).not.toHaveTextContent('已核對：')
  })

  it('hides non-applicable coverage cards for non-medication modules only', () => {
    const nonApplicableCoverage = {
      sourceId: 'taiwan-nhi-diabetes' as const,
      sourceKind: 'coverage' as const,
      sourceLabel: '健保給付',
      version: '第 5 節 115.07.23／第 2 節 115.05.22',
      effectiveFrom: '2026-07-23',
      status: 'not-applicable' as const,
      summary: '本項是臨床照護問題，不屬於藥品給付判定。',
      references: [],
    }
    const coverageResult: CdssResult = {
      ...result(),
      recommendations: [
        recommendation('non-medication-coverage', {
          domain: 'monitoring',
          sourceAssessments: [nonApplicableCoverage],
        }),
        recommendation('medication-coverage', {
          domain: 'medication',
          sourceAssessments: [nonApplicableCoverage],
        }),
      ],
    }

    render(<ClinicalDecisionSupportView result={coverageResult} locale="zh-TW" />)

    fireEvent.click(screen.getByTestId('cdss-recommendation-trigger-non-medication-coverage'))
    const nonMedicationSupporting = screen.getByTestId(
      'cdss-supporting-context-non-medication-coverage',
    )
    expect(nonMedicationSupporting).not.toHaveTextContent('健保給付')
    expect(screen.queryByTestId('cdss-source-comparison-non-medication-coverage')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('cdss-recommendation-trigger-medication-coverage'))
    const medicationSupporting = screen.getByTestId('cdss-supporting-context-medication-coverage')
    expect(medicationSupporting).toHaveTextContent('健保給付')
    expect(medicationSupporting).toHaveTextContent('不適用')
    expect(medicationSupporting).toHaveTextContent('本項是臨床照護問題，不屬於藥品給付判定。')
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

  it('renders CKD classification evidence and follow-up thresholds without duplicated trend cards', () => {
    const egfrLatestSource = {
      resourceType: 'Observation' as const,
      resourceId: 'egfr-latest',
      date: '2026-06-02',
      value: 32,
      unit: 'mL/min/1.73m²',
    }
    const uacrSource = {
      resourceType: 'Observation' as const,
      resourceId: 'uacr-old',
      date: '2024-06-10',
      value: 36.44,
      unit: 'mg/g',
    }
    const classificationResult: CdssResult = {
      ...result(),
      recommendations: [recommendation('ckd-classification', {
        domain: 'diagnosis',
        status: 'needs-data',
        title: '最近可判讀 CKD 分期：G3b / A2｜待更新：近期定量 UACR（mg/g）',
        patientEvidence: [
          {
            label: '最近可判讀分期',
            value: 'G3b / A2（極高風險）',
            factKeys: ['eGFR'],
            sources: [egfrLatestSource, uacrSource],
          },
          {
            label: 'CKD 診斷',
            value: '慢性腎臟病診斷：Chronic kidney disease, stage 3b（2026-07-21）',
            factKeys: ['ckdDiagnosis'],
            sources: [{
              resourceType: 'Condition',
              resourceId: 'ckd-diagnosis',
              date: '2026-07-21',
            }],
          },
          {
            label: '慢性化證據',
            value: '至少兩次 eGFR <60，間隔達 3 個月（2025-09-16 → 2026-06-02）',
            factKeys: ['ckdChronicity'],
            sources: [{
              resourceType: 'Observation',
              resourceId: 'egfr-earlier',
              date: '2025-09-16',
              value: 33,
              unit: 'mL/min/1.73m²',
            }, egfrLatestSource],
          },
          {
            label: '最新 eGFR',
            value: '32 mL/min/1.73m²（2026-06-02）',
            factKeys: ['eGFR'],
            sources: [egfrLatestSource],
          },
          {
            label: '尿白蛋白',
            value: '1+ (80) · 2026-01-14 ｜ 最近定量：36.44 mg/g · 2024-06-10',
            factKeys: ['urineAlbuminOverview'],
            sources: [uacrSource],
          },
        ],
        missingData: ['近期定量 UACR（mg/g）'],
        nextActions: [
          '補做或更新近期定量 UACR（mg/g），更新 G/A 分期。',
          '更新後若仍為 G3b / A2，約每 4 個月追蹤 eGFR 與定量 UACR。',
          '若 eGFR 變化 >20% 或確認 ACR 倍增，應提早評估。',
        ],
      })],
      automatedChecks: [],
    }

    render(<ClinicalDecisionSupportView result={classificationResult} locale="zh-TW" />)
    fireEvent.click(screen.getByTestId('cdss-recommendation-trigger-ckd-classification'))

    const evidence = screen.getByTestId('cdss-patient-evidence-ckd-classification')
    expect(within(evidence).getByText('診斷')).toBeInTheDocument()
    expect(within(evidence).getByText('腎功能')).toBeInTheDocument()
    expect(within(evidence).getByText('慢性化')).toBeInTheDocument()
    expect(within(evidence).getByText('白蛋白尿')).toBeInTheDocument()
    expect(evidence).toHaveTextContent(
      '已確認：33 → 32（2025-09-16 → 2026-06-02；間隔至少 3 個月）',
    )
    expect(within(evidence).queryByText('最近可判讀分期')).not.toBeInTheDocument()
    expect(screen.queryByText('歷次變化')).not.toBeInTheDocument()
    const evidenceHeading = screen.getByTestId('cdss-patient-evidence-heading-ckd-classification')
    const sourceToggle = within(evidenceHeading).getByText('查看全部資料來源')
    expect(sourceToggle).toBeInTheDocument()
    const sourceDetails = sourceToggle.closest('details')
    expect(sourceDetails).toHaveClass('relative')
    fireEvent.click(sourceToggle)
    expect(sourceDetails).toHaveAttribute('open')
    const sourceList = sourceDetails?.querySelector('ul')
    expect(sourceList).toHaveClass('absolute', 'right-0')
    const sourceRows = Array.from(sourceList?.querySelectorAll('li') ?? [])
    expect(sourceRows[0]).toHaveTextContent('2026-07-21')
    expect(sourceRows[0]?.querySelector('div')).toHaveClass('min-h-8')
    expect(sourceRows.every((row) => row.querySelector('div')?.children.length === 3)).toBe(true)

    const actionPlan = screen.getByTestId('cdss-action-plan-ckd-classification')
    expect(actionPlan).toHaveTextContent('補做或更新近期定量 UACR（mg/g），更新 G/A 分期。')
    expect(actionPlan).not.toHaveTextContent('尚待確認')
    expect(actionPlan).toHaveClass('rounded-t-md')
    const supporting = screen.getByTestId('cdss-supporting-context-ckd-classification')
    expect(supporting).toHaveAttribute('open')
    expect(supporting).toHaveClass('rounded-b-md', 'border-t-0')
    expect(within(supporting).getByText('追蹤、來源與限制')).toBeInTheDocument()
    fireEvent.click(within(supporting).getByText('追蹤、來源與限制'))
    expect(supporting).not.toHaveAttribute('open')
    fireEvent.click(within(supporting).getByText('追蹤、來源與限制'))
    expect(supporting).toHaveAttribute('open')
    const thresholds = screen.getByTestId('cdss-classification-thresholds-ckd-classification')
    expect(within(thresholds).getByText('追蹤與警示門檻')).toBeInTheDocument()
    expect(thresholds).toHaveTextContent('約每 4 個月追蹤 eGFR 與定量 UACR')
    expect(thresholds).toHaveTextContent('eGFR 變化 >20%')
  })

  it('hides clinical-review rows that only restate the next step', () => {
    render(
      <ClinicalDecisionSupportView
        locale="zh-TW"
        result={{
          ...result(),
          recommendations: [
            recommendation('finerenone-review-dedupe', {
              domain: 'medication',
              nextActions: ['先評估 RASi 治療，再評估 finerenone。'],
              clinicalReviewItems: ['RASi 治療適切性與耐受性'],
            }),
          ],
        }}
      />,
    )

    fireEvent.click(screen.getByTestId('cdss-recommendation-trigger-finerenone-review-dedupe'))

    expect(screen.getByTestId('cdss-action-plan-finerenone-review-dedupe')).toHaveTextContent(
      '先評估 RASi 治療，再評估 finerenone。',
    )
    const supporting = screen.getByTestId('cdss-supporting-context-finerenone-review-dedupe')
    expect(supporting).toHaveAttribute('open')
    expect(within(supporting).queryByText('視臨床情境確認')).not.toBeInTheDocument()
    expect(within(supporting).queryByText('RASi 治療適切性與耐受性')).not.toBeInTheDocument()
  })

  it('keeps clinical-review rows that add a new decision condition', () => {
    render(
      <ClinicalDecisionSupportView
        locale="zh-TW"
        result={{
          ...result(),
          recommendations: [
            recommendation('clinical-review-information-gain', {
              domain: 'medication',
              nextActions: ['評估是否開始治療。'],
              clinicalReviewItems: ['近期低血壓或急性病況'],
            }),
          ],
        }}
      />,
    )

    fireEvent.click(screen.getByTestId('cdss-recommendation-trigger-clinical-review-information-gain'))

    const supporting = screen.getByTestId('cdss-supporting-context-clinical-review-information-gain')
    expect(within(supporting).queryByText('視臨床情境確認')).not.toBeInTheDocument()
    expect(screen.getByTestId('cdss-action-plan-clinical-review-information-gain')).toHaveTextContent(
      '評估是否開始治療；並確認近期低血壓或急性病況。',
    )
  })

  it('merges only new clinical context into the next step', () => {
    render(
      <ClinicalDecisionSupportView
        locale="zh-TW"
        result={{
          ...result(),
          recommendations: [
            recommendation('blood-pressure-context-merge', {
              missingData: ['標準化診間血壓與量測日期'],
              nextActions: ['更新標準化診間血壓；有姿勢性症狀時加測坐／站立血壓。'],
              clinicalReviewItems: ['姿勢性症狀、跌倒風險與體液狀態'],
            }),
          ],
        }}
      />,
    )

    fireEvent.click(screen.getByTestId('cdss-recommendation-trigger-blood-pressure-context-merge'))

    const actionPlan = screen.getByTestId('cdss-action-plan-blood-pressure-context-merge')
    expect(actionPlan).toHaveTextContent(
      '補齊：標準化診間血壓與量測日期；更新標準化診間血壓；有姿勢性症狀時加測坐／站立血壓；並確認跌倒風險與體液狀態。',
    )
    expect(actionPlan.textContent?.match(/姿勢性症狀/g)).toHaveLength(1)
    expect(screen.queryByText('視臨床情境確認')).not.toBeInTheDocument()
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
    const evidenceHeading = screen.getByTestId('cdss-patient-evidence-heading-evidence-layout')
    expect(within(evidenceHeading).getByRole('button', {
      name: '在左側開啟來源紀錄',
    })).toHaveTextContent('查看資料來源')
    const evidenceRows = screen.getByTestId('cdss-patient-evidence-rows-evidence-layout')
    expect(evidenceRows.querySelectorAll('dl > div')).toHaveLength(2)
    expect(evidenceRows.querySelector('dl > div')).toHaveClass('py-1.5')
    expect(within(evidenceRows).queryByRole('button')).not.toBeInTheDocument()
    expect(within(actionPlan).queryByText('尚待確認')).not.toBeInTheDocument()
    expect(actionPlan).toHaveTextContent(
      '補齊：LDL-C 與採檢日期；下一步 evidence-layout',
    )
  })
})
