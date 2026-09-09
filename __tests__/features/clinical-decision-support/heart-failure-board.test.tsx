import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

/**
 * The HFpEF pathway: the pack evaluates none of the HFrEF pillars and builds
 * its own treatment card instead.
 */
function hfpefResult(): CdssResult {
  const result = heartFailureResult()
  return {
    ...result,
    recommendations: [
      ...result.recommendations.filter((item) => !/ras-inhibition|beta-blocker|-mra$|sglt2|hfref-gdmt/.test(item.id)),
      recommendation('heart-failure-hfpef-treatment', 'HFpEF 治療', {
        moduleGroup: 'treatment',
        domain: 'medication',
        status: 'review',
        title: 'HFpEF（LVEF ≥50%）：核對 SGLT2 抑制劑與表型導向治療',
      }),
    ],
  }
}

/**
 * Neither pathway opened — no diagnosis, LVEF above the HFrEF line — so the
 * pack produced the phenotype card and nothing else.
 */
function phenotypeOnlyResult(): CdssResult {
  const result = heartFailureResult()
  return {
    ...result,
    recommendations: result.recommendations.filter((item) => item.id === 'heart-failure-phenotype'),
    automatedChecks: [],
  }
}

const HFPEF_FACTS = {
  arniTherapy: { zh: '目前未使用', en: 'Not currently taking' },
  aceArbTherapy: {
    zh: '目前用藥中：Valsartan 80mg',
    en: 'Currently taking: Valsartan 80mg',
    sources: [{ resourceType: 'MedicationRequest' as const, resourceId: 'rx-1', date: '2026-08-20' }],
  },
  hfEvidenceBetaBlockerTherapy: { zh: '目前未使用', en: 'Not currently taking' },
  mraTherapy: { zh: '目前未使用（最近一筆處方 2026-03-01 結束）', en: 'Not currently taking (latest prescription ended 2026-03-01)' },
  sglt2Therapy: { zh: '目前用藥中：Dapagliflozin 10mg', en: 'Currently taking: Dapagliflozin 10mg' },
}

/** A patient outside the HFrEF pathway: the laboratory ran the panel, no module read it. */
const RECORD_ONLY_FACTS = {
  ...HFPEF_FACTS,
  potassium: {
    zh: '2.8 mmol/L（2026-08-20）',
    en: '2.8 mmol/L (2026-08-20)',
    numericValue: 2.8,
    unit: 'mmol/L',
    date: '2026-08-20',
    sources: [{ resourceType: 'Observation' as const, resourceId: 'obs-k', date: '2026-08-20' }],
  },
  sodium: {
    zh: '142 mmol/L（2026-08-20）',
    en: '142 mmol/L (2026-08-20)',
    numericValue: 142,
    unit: 'mmol/L',
    date: '2026-08-20',
    sources: [{ resourceType: 'Observation' as const, resourceId: 'obs-na', date: '2026-08-20' }],
  },
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

  it('opens with the pack\'s next steps for what needs the clinician today, actionable before data-needed', () => {
    const board = buildHeartFailureBoard(heartFailureResult(), 'zh-TW', NOW)!

    expect(board.headlines.map((headline) => [headline.recommendation.id, headline.action])).toEqual([
      ['heart-failure-medication-safety', '完成跨處方來源 medication reconciliation，再由臨床人員決定替代、調整或續用。'],
      ['heart-failure-ras-inhibition', '評估把 ACEI／ARB 換成 sacubitril/valsartan（ARNI），並記錄臨床決定。'],
      ['heart-failure-mra', '評估建立或最佳化 MRA，並記錄臨床決定。'],
    ])
    expect(board.headlines[0].reason).toContain('NSAID')
    expect(board.evaluatedCount).toBe(11)
  })

  it('is silent when nothing is actionable or missing', () => {
    const result = heartFailureResult()
    const quiet: CdssResult = {
      ...result,
      recommendations: result.recommendations.filter((item) => item.status === 'no-action' || item.status === 'review'),
    }
    expect(buildHeartFailureBoard(quiet, 'zh-TW', NOW)!.headlines).toEqual([])
  })

  it('is not built for any other pack', () => {
    expect(buildHeartFailureBoard(heartFailureResult({ packId: 'ckd-cdss' }), 'zh-TW', NOW)).toBeUndefined()
  })

  it('shows no pillars for a pathway that produced none when no facts are given', () => {
    const board = buildHeartFailureBoard(hfpefResult(), 'zh-TW', NOW)!
    expect(board.pillars).toEqual([])
    expect(board.gdmt).toBeUndefined()
    expect(board.consumedIds.has('heart-failure-hfref-gdmt')).toBe(false)
  })

  it('reads a safety input no module carried straight from the record, and says so', () => {
    const board = buildHeartFailureBoard(phenotypeOnlyResult(), 'zh-TW', NOW, RECORD_ONLY_FACTS)!

    const potassium = board.metrics.find((metric) => metric.factKey === 'potassium')!
    expect(potassium.value).toBe('2.8')
    expect(potassium.unit).toBe('mmol/L')
    expect(potassium.date).toBe('2026-08-20')
    expect(potassium.ageDays).toBe(16)
    expect(potassium.evaluated).toBe(false)
    expect(potassium.stale).toBe(false)
    expect(potassium.evidence?.sources?.[0]?.resourceId).toBe('obs-k')
    expect(board.metrics.find((metric) => metric.factKey === 'sodium')?.evaluated).toBe(false)
    // The phenotype card still carries LVEF and NT-proBNP itself.
    expect(board.lvef?.value).toBe('32%')
    // Nothing in the record either: still absent, not invented.
    expect(board.metrics.find((metric) => metric.factKey === 'heartRate')?.value).toBeUndefined()
    expect(board.metrics.find((metric) => metric.factKey === 'eGFR')?.value).toBeUndefined()
  })

  it('prefers the module\'s own evidence over the record when a module did read the value', () => {
    // The HFpEF result keeps the safety module, which carries potassium 4.9.
    const board = buildHeartFailureBoard(hfpefResult(), 'zh-TW', NOW, RECORD_ONLY_FACTS)!
    const potassium = board.metrics.find((metric) => metric.factKey === 'potassium')!
    expect(potassium.value).toBe('4.9')
    expect(potassium.evaluated).toBe(true)
  })

  it('reads unevaluated pillars from the therapy facts, taking class first', () => {
    const board = buildHeartFailureBoard(hfpefResult(), 'zh-TW', NOW, HFPEF_FACTS)!

    // On the HFpEF pathway the strip is the two classes ESC 2026
    // Recommendation Table 5 recommends 「independent of LVEF」. The other two
    // name 「symptomatic HFrEF」, and a tile for each of them here would read as
    // a checklist of what this patient is missing.
    expect(board.pillarScope).toBe('lvef-independent')
    expect(board.pillars.map((pillar) => [pillar.id, pillar.evaluated, pillar.taking, pillar.medicationNames])).toEqual([
      ['heart-failure-mra', false, false, undefined],
      ['heart-failure-sglt2', false, true, 'Dapagliflozin 10mg'],
    ])
    expect(board.pillars[0].therapyEvidence?.factKeys).toEqual(['mraTherapy'])
    expect(board.pillars[0].status).toBeUndefined()
    expect(board.gdmt).toBeUndefined()
    expect(board.consumedIds.has('heart-failure-hfref-gdmt')).toBe(false)
    // The tiles the HFrEF pathway owns are not consumed here, so nothing the
    // board hid goes missing from the module list either.
    expect(board.consumedIds.has('heart-failure-ras-inhibition')).toBe(false)
  })

  it('shows no foundational-therapy strip where the pack opened no pathway', () => {
    const board = buildHeartFailureBoard(phenotypeOnlyResult(), 'zh-TW', NOW, HFPEF_FACTS)!

    // Nobody has said they suspect heart failure, so a therapy checklist would
    // be answering a question that was never asked.
    expect(board.pillarScope).toBe('none')
    expect(board.pillars).toEqual([])
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

  it('reads today\'s sentences first, then lists rows action-first, and copies a rationale', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    render(<ClinicalDecisionSupportView result={heartFailureResult()} locale="zh-TW" />)

    const headlines = screen.getByTestId('cdss-hf-headlines')
    expect(headlines).toHaveTextContent('今天要做的 3 件事')
    expect(within(headlines).getByTestId('cdss-hf-headline-heart-failure-medication-safety'))
      .toHaveTextContent('完成跨處方來源 medication reconciliation')
    expect(within(headlines).getByTestId('cdss-hf-headline-heart-failure-mra')).toHaveTextContent('MRA 治療')

    // A listed row leads with the pack's next step; module and basis follow.
    const row = screen.getByTestId('cdss-recommendation-trigger-heart-failure-congestion-diuretic')
    expect(row).toHaveAttribute('data-layout', 'action-first')
    expect(within(row).getByTestId('cdss-action-headline-heart-failure-congestion-diuretic'))
      .toHaveTextContent('在鬱血證據表勾選適用的項目')
    expect(within(row).getByTestId('cdss-module-cell-heart-failure-congestion-diuretic')).toHaveTextContent('鬱血與利尿策略')
    expect(within(row).getByTestId('cdss-evidence-preview-heart-failure-congestion-diuretic')).toHaveTextContent('體重：74.5 kg')

    fireEvent.click(row)
    fireEvent.click(screen.getByTestId('cdss-copy-rationale-heart-failure-congestion-diuretic'))
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    const copied = writeText.mock.calls[0][0] as string
    expect(copied).toContain('【判定理由】鬱血與利尿策略')
    expect(copied).toContain('來源：MediPrisma 個人化照護指引 · heart-failure-cdss 0.2.0-poc')
  })

  it('shows one quiet line when the visit needs nothing', () => {
    const result = heartFailureResult()
    const quiet: CdssResult = {
      ...result,
      recommendations: result.recommendations.filter((item) => item.status === 'no-action'),
    }
    render(<ClinicalDecisionSupportView result={quiet} locale="zh-TW" />)
    const headlines = screen.getByTestId('cdss-hf-headlines')
    expect(headlines).toHaveAttribute('data-silent', 'true')
    expect(headlines).toHaveTextContent('本次無需處理')
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

  it('marks a value entered in the room and hands typed measurements back as vitals', () => {
    const result = heartFailureResult()
    const entered = evidence('血壓', '128/76 mmHg（2026-09-05 門診輸入）', 'bloodPressure')
    const withEntry: CdssResult = {
      ...result,
      recommendations: result.recommendations.map((item) => ({
        ...item,
        patientEvidence: item.patientEvidence.map((row) => (
          row.factKeys.includes('bloodPressure') ? entered : row
        )),
      })),
    }
    const onSave = jest.fn()
    const onClear = jest.fn()
    render(
      <ClinicalDecisionSupportView
        result={withEntry}
        locale="zh-TW"
        clinicVitals={{ systolic: 128, diastolic: 76, measuredOn: '2026-09-05' }}
        onSaveClinicVitals={onSave}
        onClearClinicVitals={onClear}
      />,
    )

    const bp = screen.getByTestId('cdss-hf-metric-bloodPressure')
    expect(bp).toHaveAttribute('data-entered', 'true')
    expect(bp).toHaveTextContent('128/76')
    expect(bp).toHaveTextContent('門診輸入')

    fireEvent.click(screen.getByTestId('cdss-hf-clinic-vitals-open'))
    expect(screen.getByTestId('cdss-hf-clinic-vitals-systolic')).toHaveValue(128)
    fireEvent.change(screen.getByTestId('cdss-hf-clinic-vitals-heartRate'), { target: { value: '72' } })
    fireEvent.change(screen.getByTestId('cdss-hf-clinic-vitals-bodyWeight'), { target: { value: '73.5' } })
    fireEvent.click(screen.getByTestId('cdss-hf-clinic-vitals-save'))

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0]).toMatchObject({ systolic: 128, diastolic: 76, heartRate: 72, bodyWeight: 73.5 })
    expect(onSave.mock.calls[0][0].measuredOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(screen.queryByTestId('cdss-hf-clinic-vitals-form')).toBeNull()

    fireEvent.click(screen.getByTestId('cdss-hf-clinic-vitals-open'))
    fireEvent.click(screen.getByTestId('cdss-hf-clinic-vitals-clear'))
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('answers 今天有鬱血徵象嗎 with a tap, and stays unanswered by default', () => {
    const onSave = jest.fn()
    const { unmount } = render(
      <ClinicalDecisionSupportView result={heartFailureResult()} locale="zh-TW" onSaveClinicVitals={onSave} />,
    )
    const signs = screen.getByTestId('cdss-hf-congestion-signs')
    expect(signs).toHaveTextContent('預設未回答')
    fireEvent.click(screen.getByTestId('cdss-hf-congestion-sign-edema'))
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0]).toMatchObject({ congestionSigns: ['edema'] })
    unmount()

    render(
      <ClinicalDecisionSupportView
        result={heartFailureResult()}
        locale="zh-TW"
        clinicVitals={{ measuredOn: '2026-09-08', congestionSigns: ['edema'] }}
        onSaveClinicVitals={onSave}
      />,
    )
    expect(screen.getByTestId('cdss-hf-congestion-sign-edema')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('cdss-hf-congestion-signs')).toHaveTextContent('已寫進鬱血證據表')
    fireEvent.click(screen.getByTestId('cdss-hf-congestion-sign-edema'))
    expect(onSave.mock.calls[1][0].congestionSigns).toBeUndefined()
  })

  it('refuses half a blood pressure and offers no entry without a save handler', () => {
    const onSave = jest.fn()
    const { unmount } = render(
      <ClinicalDecisionSupportView result={heartFailureResult()} locale="zh-TW" onSaveClinicVitals={onSave} />,
    )
    fireEvent.click(screen.getByTestId('cdss-hf-clinic-vitals-open'))
    fireEvent.change(screen.getByTestId('cdss-hf-clinic-vitals-systolic'), { target: { value: '130' } })
    expect(screen.getByTestId('cdss-hf-clinic-vitals-save')).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('收縮壓與舒張壓要一起填')
    fireEvent.change(screen.getByTestId('cdss-hf-clinic-vitals-diastolic'), { target: { value: '80' } })
    expect(screen.getByTestId('cdss-hf-clinic-vitals-save')).toBeEnabled()
    unmount()

    render(<ClinicalDecisionSupportView result={heartFailureResult()} locale="zh-TW" />)
    expect(screen.queryByTestId('cdss-hf-clinic-vitals-open')).toBeNull()
  })

  /**
   * This case used to hold that all four pillars stayed on screen outside the
   * HFrEF pathway, as plain prescription state. HMC reversed it on 2026-09-09:
   * ESC 2026 Recommendation Table 5 names 「symptomatic HFrEF」 for the
   * beta-blocker and for ACE-I/ARNI/ARB, so a strip headed 「四大 FMT 支柱」
   * put an ARNI checklist in front of an HFpEF patient — a caveat above the
   * tiles does not undo what four tiles marked 「目前未使用」 read as. The two
   * classes ESC recommends independent of LVEF stay.
   */
  it('keeps only the LVEF-independent classes on the HFpEF pathway', () => {
    render(<ClinicalDecisionSupportView result={hfpefResult()} locale="zh-TW" profileFacts={HFPEF_FACTS} />)

    const pillars = screen.getByTestId('cdss-hf-pillars')
    expect(pillars).toHaveAttribute('data-pillar-scope', 'lvef-independent')
    expect(within(pillars).getByTestId('cdss-hf-pillars-title')).toHaveTextContent('不分 LVEF 的 FMT')
    expect(within(pillars).getByTestId('cdss-hf-pillars-unassessed-note')).toBeInTheDocument()
    expect(screen.queryByTestId('cdss-hf-gdmt-trigger')).toBeNull()

    expect(within(pillars).queryByTestId('cdss-hf-pillar-heart-failure-ras-inhibition')).toBeNull()
    expect(within(pillars).queryByTestId('cdss-hf-pillar-heart-failure-beta-blocker')).toBeNull()

    const sglt2 = within(pillars).getByTestId('cdss-hf-pillar-heart-failure-sglt2')
    expect(sglt2.tagName).toBe('DIV')
    expect(sglt2).toHaveAttribute('data-evaluated', 'false')
    expect(sglt2).toHaveTextContent('Dapagliflozin 10mg')
    expect(sglt2).toHaveTextContent('使用中 · 本次未判定')
    const mra = within(pillars).getByTestId('cdss-hf-pillar-heart-failure-mra')
    expect(mra).toHaveTextContent('本次未判定')
    expect(mra).toHaveTextContent('目前未使用（最近一筆處方 2026-03-01 結束）')

    fireEvent.click(sglt2)
    expect(screen.queryByTestId('cdss-hf-pillar-detail-heart-failure-sglt2')).toBeNull()
  })

  it('shows no foundational-therapy strip where the pack opened no pathway', () => {
    render(<ClinicalDecisionSupportView result={phenotypeOnlyResult()} locale="zh-TW" profileFacts={HFPEF_FACTS} />)

    expect(screen.queryByTestId('cdss-hf-pillars')).toBeNull()
  })

  it('shows a laboratory value no module read as a number with 未判定, not as 未取得', () => {
    render(<ClinicalDecisionSupportView result={phenotypeOnlyResult()} locale="zh-TW" profileFacts={RECORD_ONLY_FACTS} />)

    const potassium = screen.getByTestId('cdss-hf-metric-potassium')
    expect(potassium).not.toHaveAttribute('data-missing')
    expect(potassium).toHaveAttribute('data-evaluated', 'false')
    expect(potassium).toHaveTextContent('2.8')
    expect(potassium).toHaveTextContent('本次未判定')
    expect(potassium).not.toHaveTextContent('未取得')
    expect(potassium).toHaveAttribute('title', expect.stringContaining('本次無模組判定'))
    // An absent value is still 未取得, without the note.
    const heartRate = screen.getByTestId('cdss-hf-metric-heartRate')
    expect(heartRate).toHaveAttribute('data-missing', 'true')
    expect(heartRate).not.toHaveAttribute('data-evaluated')
    expect(heartRate).not.toHaveTextContent('未判定')
  })

  it('renders direction C: one line of inputs, counts under the sentences, numbered rows by kind of work', () => {
    render(<ClinicalDecisionSupportView result={heartFailureResult()} locale="zh-TW" layout="c" />)

    expect(screen.getByTestId('cdss-hf-status')).toHaveAttribute('data-variant', 'summary')
    const line = screen.getByTestId('cdss-hf-inputs-line')
    expect(line).toHaveTextContent('LVEF 32%')
    expect(within(line).getByTestId('cdss-hf-metric-NTproBNP')).toHaveTextContent('紀錄無值')
    expect(screen.getByTestId('cdss-hf-headlines-counts')).toHaveTextContent('可立即處理 3 · 需先補資料 1 · 需臨床確認 3 · 目前無需處理 4')
    // Three sentences take 1–3; the first listed row is 4.
    expect(screen.getByTestId('cdss-row-number-heart-failure-congestion-diuretic')).toHaveTextContent('4')
    expect(screen.getByTestId('cdss-module-group-trigger-needs-data')).toHaveTextContent('檢驗與量測')
    expect(screen.getByTestId('cdss-module-group-trigger-review')).toHaveTextContent('需判斷')
  })

  it('shows the classic module-first table for heart failure when the layout says so', () => {
    render(<ClinicalDecisionSupportView result={heartFailureResult()} locale="zh-TW" layout="classic" />)

    expect(screen.queryByTestId('cdss-hf-board')).toBeNull()
    expect(screen.getByTestId('cdss-clinical-summary')).toBeInTheDocument()
    const row = screen.getByTestId('cdss-recommendation-trigger-heart-failure-ras-inhibition')
    expect(row).toHaveAttribute('data-layout', 'module-first')
    expect(screen.getByTestId('cdss-module-group-trigger-treatment')).toBeInTheDocument()
  })

  it('leaves every other pack on the generic module table', () => {
    render(<ClinicalDecisionSupportView result={heartFailureResult({ packId: 'ckd-cdss' })} locale="zh-TW" />)

    expect(screen.queryByTestId('cdss-hf-board')).toBeNull()
    expect(screen.getByTestId('cdss-clinical-summary')).toBeInTheDocument()
    expect(screen.getByTestId('cdss-recommendation-heart-failure-ras-inhibition')).toBeInTheDocument()
    expect(screen.getByTestId('cdss-module-group-trigger-treatment')).toBeInTheDocument()
  })
})
