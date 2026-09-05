import { fireEvent, render, screen, within } from '@testing-library/react'
import { ClinicalDecisionSupportView } from '@/features/clinical-decision-support/renderers/ClinicalDecisionSupportView'
import { buildHeartFailureBoard } from '@/features/clinical-decision-support/renderers/heart-failure-board'
import type {
  CdssRecommendation,
  CdssResult,
  ClinicalEvidence,
} from '@/features/clinical-decision-support/types'

const NOW = new Date('2026-09-05T09:00:00+08:00')

function evidence(
  label: string,
  value: string,
  factKey: string,
  date?: string,
): ClinicalEvidence {
  return {
    label,
    value,
    factKeys: [factKey],
    ...(date
      ? { sources: [{ resourceType: 'Observation', resourceId: `${factKey}-${date}`, date }] }
      : {}),
  }
}

const bloodPressure = evidence('血壓', '118/72 mmHg', 'bloodPressure', '2026-09-02')
const heartRate = evidence('心率', '76 bpm', 'heartRate', '2026-09-02')
const eGfr = evidence('eGFR', '48 mL/min/1.73m²', 'eGFR', '2026-08-28')
const potassium = evidence('K', '4.9 mmol/L', 'potassium', '2026-08-28')
const sodium = evidence('Na', '137 mmol/L', 'sodium', '2026-08-28')
const bodyWeight = evidence('體重', '74.5 kg', 'bodyWeight', '2026-09-02')
const lvef = evidence('LVEF', '32%', 'LVEF', '2026-07-14')

function recommendation(
  id: string,
  moduleName: string,
  input: Partial<CdssRecommendation>,
): CdssRecommendation {
  return {
    id,
    moduleName,
    moduleGroup: 'treatment',
    domain: 'medication',
    priority: 'medium',
    status: 'review',
    title: `判斷 ${id}`,
    recommendation: `建議 ${id}`,
    rationale: `理由 ${id}`,
    patientEvidence: [],
    nextActions: [`下一步 ${id}`],
    guidelineReferences: [],
    safetyBoundary: `邊界 ${id}`,
    ...input,
  }
}

function heartFailureResult(overrides: Partial<CdssResult> = {}): CdssResult {
  return {
    title: '心衰竭個人化照護指引',
    summary: '本次產生 11 項提示。',
    packId: 'heart-failure-cdss',
    packVersion: '0.2.0-poc',
    recommendations: [
      recommendation('heart-failure-phenotype', '心衰竭表型', {
        moduleGroup: 'assessment',
        domain: 'diagnosis',
        status: 'no-action',
        priority: 'routine',
        title: '進入 HFrEF（LVEF <50%） 路徑',
        overviewEvidenceFactKey: 'LVEF',
        patientEvidence: [evidence('心衰竭診斷', 'I50.22', 'heartFailureDiagnosis'), lvef],
      }),
      recommendation('heart-failure-hfref-gdmt', 'HFrEF 四大 FMT 支柱', {
        status: 'review',
        priority: 'high',
        title: 'HFrEF 四大 FMT 支柱已確認 3/4 類',
        patientEvidence: [lvef, eGfr, potassium, bloodPressure, heartRate],
        nextActions: ['完成實際用藥、劑量、依從性、禁忌與既往不耐受原因核對。'],
      }),
      recommendation('heart-failure-ras-inhibition', 'RAS 抑制治療', {
        status: 'actionable',
        title: 'HFrEF 目前用 ACEI／ARB，建議換成 ARNI',
        overviewEvidenceFactKey: 'aceArbTherapy',
        patientEvidence: [
          lvef,
          evidence('ACEI／ARB', '目前用藥中：Valsartan 80mg', 'aceArbTherapy', '2026-08-20'),
          eGfr,
          potassium,
          bloodPressure,
        ],
        nextActions: ['評估把 ACEI／ARB 換成 sacubitril/valsartan（ARNI），並記錄臨床決定。'],
      }),
      recommendation('heart-failure-beta-blocker', 'HFrEF 實證 β 阻斷劑', {
        status: 'no-action',
        priority: 'routine',
        title: '已有 具 HFrEF 實證的 β 阻斷劑 處方',
        overviewEvidenceFactKey: 'hfEvidenceBetaBlockerTherapy',
        patientEvidence: [
          lvef,
          evidence('β 阻斷劑', '目前用藥中：Bisoprolol 2.5mg', 'hfEvidenceBetaBlockerTherapy', '2026-08-20'),
          bloodPressure,
          heartRate,
        ],
        nextActions: ['依最高耐受劑量與追蹤資料持續 具 HFrEF 實證的 β 阻斷劑。'],
      }),
      recommendation('heart-failure-mra', 'MRA 治療', {
        status: 'actionable',
        title: 'HFrEF 適用 MRA，目前無處方',
        overviewEvidenceFactKey: 'mraTherapy',
        patientEvidence: [
          lvef,
          evidence('MRA', '目前未使用', 'mraTherapy'),
          eGfr,
          potassium,
        ],
        nextActions: ['評估建立或最佳化 MRA，並記錄臨床決定。'],
      }),
      recommendation('heart-failure-sglt2', 'SGLT2i 治療', {
        status: 'no-action',
        priority: 'routine',
        title: '已有 SGLT2i 處方',
        overviewEvidenceFactKey: 'sglt2Therapy',
        patientEvidence: [
          lvef,
          evidence('SGLT2i', '目前用藥中：Dapagliflozin 10mg', 'sglt2Therapy', '2026-08-20'),
          eGfr,
        ],
        nextActions: ['依最高耐受劑量與追蹤資料持續 SGLT2i。'],
      }),
      recommendation('heart-failure-fmt-safety', 'FMT 調整安全', {
        moduleGroup: 'monitoring',
        domain: 'safety',
        status: 'no-action',
        priority: 'routine',
        title: 'FMT 結構化安全資料目前未見明確警訊',
        overviewEvidenceFactKeys: ['bloodPressure', 'heartRate', 'eGFR', 'potassium'],
        patientEvidence: [bloodPressure, heartRate, eGfr, potassium],
      }),
      recommendation('heart-failure-congestion-diuretic', '鬱血與利尿策略', {
        status: 'needs-data',
        title: '鬱血證據表沒有任何已開啟的項目，無法判定容量狀態',
        overviewEvidenceFactKey: 'bodyWeight',
        patientEvidence: [bodyWeight, eGfr, sodium, potassium],
        missingData: ['鬱血證據表中至少一項可判定方向的紀錄：NT-proBNP、體重趨勢、CXR 或 chest CT 報告文字'],
        nextActions: ['在鬱血證據表勾選適用的項目並補上醫師填寫的徵象，再決定維持或調整利尿策略。'],
        evidenceTables: [{
          concept: 'congestion',
          items: [
            {
              id: 'congestion:nt-probnp',
              label: { zh: 'NT-proBNP', en: 'NT-proBNP' },
              category: 'biomarker',
              derivability: 'record-derived',
              direction: 'unknown',
              defaultEnabled: false,
            },
          ],
          supportsCount: 0,
          againstCount: 0,
          unknownCount: 1,
          limitations: [],
          evidenceReferences: [],
        }],
      }),
      recommendation('heart-failure-medication-safety', '心衰竭用藥安全', {
        moduleGroup: 'monitoring',
        domain: 'safety',
        status: 'actionable',
        priority: 'high',
        title: '目前處方掃到 ESC 點名的 1 類藥物：NSAID／COX-2 抑制劑',
        overviewEvidenceFactKey: 'hfHarmfulNsaid',
        patientEvidence: [
          evidence('NSAID／COX-2 抑制劑', '目前用藥中：Diclofenac 50mg', 'hfHarmfulNsaid', '2026-08-25'),
          eGfr,
          bodyWeight,
        ],
        nextActions: ['完成跨處方來源 medication reconciliation，再由臨床人員決定替代、調整或續用。'],
      }),
      recommendation('heart-failure-monitoring', '心衰竭追蹤', {
        moduleGroup: 'monitoring',
        domain: 'monitoring',
        status: 'review',
        title: '完成症狀、容量狀態、生命徵象與治療安全監測',
        patientEvidence: [bodyWeight, bloodPressure],
      }),
      recommendation('cardiac-rehabilitation', '心臟復健', {
        moduleGroup: 'care',
        domain: 'care-gap',
        status: 'review',
        title: 'HF 病人應評估心臟復健轉介與個人化運動計畫',
      }),
    ],
    notEvaluated: ['即時 DHF 與其他急症。'],
    disclaimer: 'Heart Failure CDSS POC。',
    ...overrides,
  }
}

describe('heart-failure board model', () => {
  it('reads the safety inputs, their age, and what is missing out of the pack output', () => {
    const board = buildHeartFailureBoard(heartFailureResult(), 'zh-TW', NOW)

    expect(board).toBeDefined()
    expect(board!.metrics.map((metric) => metric.factKey)).toEqual([
      'bloodPressure', 'heartRate', 'potassium', 'eGFR', 'sodium', 'bodyWeight', 'NTproBNP',
    ])
    const bp = board!.metrics[0]
    expect(bp.value).toBe('118/72')
    expect(bp.unit).toBe('mmHg')
    expect(bp.date).toBe('2026-09-02')
    expect(bp.ageDays).toBe(3)
    expect(bp.stale).toBe(false)
    const egfr = board!.metrics[3]
    expect(egfr.value).toBe('48')
    expect(egfr.ageDays).toBe(8)
    // NT-proBNP has an evidence-table row but no value: absent, and named as a
    // laboratory order rather than left blank.
    const ntProBnp = board!.metrics[6]
    expect(ntProBnp.value).toBeUndefined()
    expect(ntProBnp.kind).toBe('lab')
    expect(board!.lvef?.value).toBe('32%')
    expect(board!.phenotype?.id).toBe('heart-failure-phenotype')
    expect(board!.fmtSafety?.id).toBe('heart-failure-fmt-safety')
  })

  it('keeps the pack\'s stale annotation as a flag instead of dropping it', () => {
    const result = heartFailureResult()
    const fmtSafety = result.recommendations.find((item) => item.id === 'heart-failure-fmt-safety')!
    const stalePotassium = evidence('K', '4.9 mmol/L（2026-06-01，已 96 天，超過 30 天窗）', 'potassium', '2026-06-01')
    const stale: CdssResult = {
      ...result,
      recommendations: result.recommendations.map((item) => (
        item.id === fmtSafety.id
          ? { ...item, patientEvidence: [bloodPressure, heartRate, eGfr, stalePotassium] }
          : item.id === 'heart-failure-ras-inhibition' || item.id === 'heart-failure-mra' || item.id === 'heart-failure-hfref-gdmt' || item.id === 'heart-failure-congestion-diuretic'
            ? { ...item, patientEvidence: item.patientEvidence.filter((row) => !row.factKeys.includes('potassium')) }
            : item
      )),
    }

    const potassiumMetric = buildHeartFailureBoard(stale, 'zh-TW', NOW)!.metrics[2]
    expect(potassiumMetric.value).toBe('4.9')
    expect(potassiumMetric.stale).toBe(true)
    expect(potassiumMetric.fullValue).toContain('已 96 天')
  })

  it('reads each pillar\'s therapy state from the adapter\'s therapy fact', () => {
    const board = buildHeartFailureBoard(heartFailureResult(), 'zh-TW', NOW)!

    expect(board.pillars.map((pillar) => [pillar.id, pillar.taking, pillar.medicationNames])).toEqual([
      ['heart-failure-ras-inhibition', true, 'Valsartan 80mg'],
      ['heart-failure-beta-blocker', true, 'Bisoprolol 2.5mg'],
      ['heart-failure-mra', false, undefined],
      ['heart-failure-sglt2', true, 'Dapagliflozin 10mg'],
    ])
    expect(board.pillars[0].therapyDate).toBe('2026-08-20')
    expect(board.pillars[2].therapyText).toBe('目前未使用')
    expect(board.gdmt?.id).toBe('heart-failure-hfref-gdmt')
    expect(board.alerts.map((alert) => alert.id)).toEqual(['heart-failure-medication-safety'])
    expect([...board.consumedIds].sort()).toEqual([
      'heart-failure-beta-blocker',
      'heart-failure-hfref-gdmt',
      'heart-failure-medication-safety',
      'heart-failure-mra',
      'heart-failure-ras-inhibition',
      'heart-failure-sglt2',
    ])
  })

  it('is not built for any other pack', () => {
    expect(buildHeartFailureBoard(heartFailureResult({ packId: 'ckd-cdss' }), 'zh-TW', NOW)).toBeUndefined()
  })

  it('shows no pillars for a pathway that produced none', () => {
    const result = heartFailureResult()
    const hfpef: CdssResult = {
      ...result,
      recommendations: result.recommendations.filter((item) => !/ras-inhibition|beta-blocker|-mra$|sglt2|hfref-gdmt/.test(item.id)),
    }
    const board = buildHeartFailureBoard(hfpef, 'zh-TW', NOW)!
    expect(board.pillars).toEqual([])
    expect(board.gdmt).toBeUndefined()
    expect(board.consumedIds.has('heart-failure-hfref-gdmt')).toBe(false)
  })
})

describe('heart-failure board view', () => {
  it('puts status, the safety alert, and the four pillars ahead of the module list', () => {
    render(<ClinicalDecisionSupportView result={heartFailureResult()} locale="zh-TW" />)

    expect(screen.queryByTestId('cdss-clinical-summary')).toBeNull()
    const status = screen.getByTestId('cdss-hf-status')
    expect(within(status).getByText('LVEF 32%')).toBeInTheDocument()
    expect(within(status).getByTestId('cdss-hf-phenotype-title')).toHaveTextContent('進入 HFrEF')
    expect(within(status).getByTestId('cdss-hf-metric-bloodPressure')).toHaveTextContent('118/72')
    expect(within(status).getByTestId('cdss-hf-metric-bloodPressure')).toHaveTextContent('09-02')
    expect(within(status).getByTestId('cdss-hf-metric-NTproBNP')).toHaveAttribute('data-missing', 'true')
    expect(within(status).getByTestId('cdss-hf-metric-NTproBNP')).toHaveTextContent('可開單檢驗')
    expect(within(status).getByTestId('cdss-hf-fmt-safety-title')).toHaveTextContent('未見明確警訊')

    const alert = screen.getByTestId('cdss-hf-alert-heart-failure-medication-safety')
    expect(alert).toHaveTextContent('NSAID／COX-2 抑制劑')
    expect(alert).toHaveTextContent('Diclofenac 50mg')
    expect(alert).toHaveTextContent('可立即處理 · 優先')

    const pillars = screen.getByTestId('cdss-hf-pillars')
    expect(within(pillars).getByTestId('cdss-hf-pillars-title')).toHaveTextContent('已確認 3/4 類')
    expect(within(pillars).getByTestId('cdss-hf-pillar-heart-failure-ras-inhibition')).toHaveTextContent('Valsartan 80mg')
    expect(within(pillars).getByTestId('cdss-hf-pillar-heart-failure-ras-inhibition')).toHaveTextContent('可立即處理')
    expect(within(pillars).getByTestId('cdss-hf-pillar-heart-failure-mra')).toHaveAttribute('data-taking', 'false')
    expect(within(pillars).getByTestId('cdss-hf-pillar-heart-failure-mra')).toHaveTextContent('目前未使用')
    expect(within(pillars).getByTestId('cdss-hf-pillar-heart-failure-sglt2')).toHaveTextContent('使用中')
  })

  it('lists what the board did not consume by what the clinician has to do, with done modules folded but named', () => {
    render(<ClinicalDecisionSupportView result={heartFailureResult()} locale="zh-TW" />)

    // Pillars, the GDMT heading, and the alert live on the board, not in the list.
    expect(screen.queryByTestId('cdss-recommendation-heart-failure-ras-inhibition')).toBeNull()
    expect(screen.queryByTestId('cdss-recommendation-heart-failure-hfref-gdmt')).toBeNull()
    expect(screen.queryByTestId('cdss-recommendation-heart-failure-medication-safety')).toBeNull()

    expect(screen.queryByTestId('cdss-module-group-trigger-actionable')).toBeNull()
    expect(screen.getByTestId('cdss-module-group-trigger-needs-data')).toHaveTextContent('需先補資料')
    expect(screen.getByTestId('cdss-recommendation-heart-failure-congestion-diuretic')).toBeInTheDocument()
    expect(screen.getByTestId('cdss-module-group-trigger-review')).toHaveTextContent('需臨床確認')
    expect(screen.getByTestId('cdss-recommendation-heart-failure-monitoring')).toBeInTheDocument()

    const done = screen.getByTestId('cdss-module-group-trigger-no-action')
    expect(done).toHaveAttribute('aria-expanded', 'false')
    expect(within(done).getByTestId('cdss-module-group-summary-no-action'))
      .toHaveTextContent('心衰竭表型 · FMT 調整安全')
    expect(screen.queryByTestId('cdss-recommendation-heart-failure-phenotype')).toBeNull()

    fireEvent.click(done)
    expect(screen.getByTestId('cdss-recommendation-heart-failure-phenotype')).toBeInTheDocument()
    expect(screen.getByTestId('cdss-recommendation-heart-failure-fmt-safety')).toBeInTheDocument()
  })

  it('opens the same decision detail from a pillar tile and from the alert row', () => {
    render(<ClinicalDecisionSupportView result={heartFailureResult()} locale="zh-TW" />)

    fireEvent.click(screen.getByTestId('cdss-hf-pillar-heart-failure-mra'))
    const pillarDetail = screen.getByTestId('cdss-hf-pillar-detail-heart-failure-mra')
    expect(pillarDetail).toHaveTextContent('評估建立或最佳化 MRA')

    fireEvent.click(screen.getByTestId('cdss-hf-alert-trigger-heart-failure-medication-safety'))
    expect(screen.queryByTestId('cdss-hf-pillar-detail-heart-failure-mra')).toBeNull()
    expect(screen.getByTestId('cdss-hf-alert-detail-heart-failure-medication-safety'))
      .toHaveTextContent('medication reconciliation')
  })

  it('keeps the done group open when it is the whole list', () => {
    const result = heartFailureResult()
    const phenotypeOnly: CdssResult = {
      ...result,
      recommendations: result.recommendations.filter((item) => item.id === 'heart-failure-phenotype'),
    }
    render(<ClinicalDecisionSupportView result={phenotypeOnly} locale="zh-TW" />)

    expect(screen.getByTestId('cdss-module-group-trigger-no-action')).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('cdss-recommendation-heart-failure-phenotype')).toBeInTheDocument()
  })

  it('leaves every other pack on the generic module table', () => {
    render(<ClinicalDecisionSupportView result={heartFailureResult({ packId: 'ckd-cdss' })} locale="zh-TW" />)

    expect(screen.queryByTestId('cdss-hf-board')).toBeNull()
    expect(screen.getByTestId('cdss-clinical-summary')).toBeInTheDocument()
    expect(screen.getByTestId('cdss-recommendation-heart-failure-ras-inhibition')).toBeInTheDocument()
    expect(screen.getByTestId('cdss-module-group-trigger-treatment')).toBeInTheDocument()
  })
})
