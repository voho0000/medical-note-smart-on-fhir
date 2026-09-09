import { fireEvent, render, screen, within } from '@testing-library/react'
import { ClinicalDecisionSupportView } from '@/features/clinical-decision-support/renderers/ClinicalDecisionSupportView'
import { buildHeartFailureBoard, stripDecisionSuffix } from '@/features/clinical-decision-support/renderers/heart-failure-board'
import type {
  CdssRecommendation,
  CdssResult,
  ClinicalEvidence,
} from '@/features/clinical-decision-support/types'

const NOW = new Date('2026-09-05T09:00:00+08:00')

/** The option sets the pack declares, quoted here exactly as the pack writes them. */
const THERAPY_OPTIONS = [
  { id: 'prescribed', zh: '已開立', en: 'Prescribed', outcome: 'no-action' },
  { id: 'contraindicated-or-intolerant', zh: '禁忌／不耐受', en: 'Contraindicated or not tolerated', outcome: 'no-action' },
  { id: 'not-today', zh: '今天先不開', en: 'Not today', outcome: 'review' },
] as const

const SAFETY_OPTIONS = [
  { id: 'reconciled', zh: '已處理', en: 'Reconciled', outcome: 'no-action' },
  { id: 'keep-with-reason', zh: '維持並記錄理由', en: 'Kept with a reason', outcome: 'review' },
] as const

const CONGESTION_OPTIONS = [
  { id: 'start-loop-diuretic', zh: '開立／調整 loop 利尿劑', en: 'Start or adjust a loop diuretic', outcome: 'no-action' },
  { id: 'correct-potassium-first', zh: '先處理電解質', en: 'Correct the electrolytes first', outcome: 'review' },
  { id: 'observe', zh: '先觀察', en: 'Observe', outcome: 'review' },
] as const

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
        title: 'HFrEF（LVEF <50%） 路徑 · LVEF 32%',
        overviewEvidenceFactKey: 'LVEF',
        patientEvidence: [evidence('心衰竭診斷', 'I50.22', 'heartFailureDiagnosis'), lvef],
      }),
      recommendation('heart-failure-hfref-gdmt', 'HFrEF 四大 FMT 支柱', {
        status: 'review',
        priority: 'high',
        title: '四支柱 3／4 在用 · 缺 MRA',
        patientEvidence: [lvef, eGfr, potassium, bloodPressure, heartRate],
        nextActions: ['依血壓、心率、K 與 eGFR 決定今天先建立哪一支柱。'],
      }),
      recommendation('heart-failure-ras-inhibition', 'RAS 抑制治療', {
        status: 'actionable',
        title: 'HFrEF 目前用 ACEI／ARB，未見 ARNI（ESC 2026 Class I 換藥建議） · eGFR 48 · K 4.9',
        decisionOptions: THERAPY_OPTIONS,
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
        title: '具 HFrEF 實證的 β 阻斷劑 使用中',
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
        title: 'HFrEF 適用 MRA，目前無處方 · eGFR 48 · K 4.9',
        decisionOptions: THERAPY_OPTIONS,
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
        title: 'SGLT2i 使用中 · eGFR 48',
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
        title: 'FMT 安全數值目前無警訊',
        overviewEvidenceFactKeys: ['bloodPressure', 'heartRate', 'eGFR', 'potassium'],
        patientEvidence: [bloodPressure, heartRate, eGfr, potassium],
      }),
      recommendation('heart-failure-congestion-diuretic', '鬱血與利尿策略', {
        status: 'needs-data',
        title: '鬱血證據表沒有可判定方向的項目',
        decisionOptions: CONGESTION_OPTIONS,
        overviewEvidenceFactKey: 'bodyWeight',
        patientEvidence: [bodyWeight, eGfr, sodium, potassium],
        missingData: ['鬱血證據表中至少一項可判定方向的紀錄：NT-proBNP、體重趨勢、CXR 或 chest CT 報告文字'],
        nextActions: ['由今天的症狀與徵象判定容量狀態，並決定利尿策略。'],
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
        title: '處方中有 ESC 點名的 1 類藥物：NSAID／COX-2 抑制劑',
        decisionOptions: SAFETY_OPTIONS,
        overviewEvidenceFactKey: 'hfHarmfulNsaid',
        patientEvidence: [
          evidence('NSAID／COX-2 抑制劑', '目前用藥中：Diclofenac 50mg', 'hfHarmfulNsaid', '2026-08-25'),
          eGfr,
          bodyWeight,
        ],
        nextActions: ['決定這幾類藥要替代、調整還是續用，並記錄理由。'],
      }),
      recommendation('heart-failure-monitoring', '心衰竭追蹤', {
        moduleGroup: 'monitoring',
        domain: 'monitoring',
        status: 'review',
        title: '缺 2 項：心律、近期體重',
        patientEvidence: [bodyWeight, bloodPressure],
      }),
      recommendation('cardiac-rehabilitation', '心臟復健', {
        moduleGroup: 'care',
        domain: 'care-gap',
        status: 'review',
        title: '心衰竭診斷在案，紀錄無心臟復健計畫',
      }),
    ],
    notEvaluated: ['即時 DHF 與其他急症。'],
    disclaimer: 'Heart Failure CDSS POC。',
    ...overrides,
  }
}

function hfpefResult(): CdssResult {
  const result = heartFailureResult()
  return {
    ...result,
    recommendations: result.recommendations.filter((item) => !/ras-inhibition|beta-blocker|-mra$|sglt2|hfref-gdmt/.test(item.id)),
  }
}

/**
 * The HFpEF pathway as the pack 0.4.0-poc emits it: the four cards that always
 * appear, without the beta-blocker card (this patient is on none) and without
 * the incretin card (no T2DM or obesity code). Those two absences are what the
 * board has to turn into a sentence rather than into a missing tile.
 */
function hfpefTherapyResult(overrides: CdssRecommendation[] = []): CdssResult {
  const base = hfpefResult()
  const overrideIds = new Set(overrides.map((item) => item.id))
  return {
    ...base,
    recommendations: [
      ...base.recommendations,
      ...[
        recommendation('heart-failure-hfpef-sglt2', 'HFpEF SGLT2i 治療', {
          status: 'no-action',
          priority: 'routine',
          title: 'SGLT2i 使用中：Dapagliflozin 10mg',
          overviewEvidenceFactKey: 'sglt2Therapy',
          patientEvidence: [
            evidence('SGLT2 抑制劑', '目前用藥中：Dapagliflozin 10mg', 'sglt2Therapy', '2026-08-20'),
          ],
          nextActions: ['依耐受度續用 SGLT2i，並記錄追蹤計畫。'],
        }),
        recommendation('heart-failure-hfpef-mra', 'HFpEF MRA 治療（sMRA／nsMRA）', {
          status: 'review',
          title: 'MRA 無處方，ESC 2026 Class I 不分 LVEF · eGFR 48',
          decisionOptions: THERAPY_OPTIONS,
          overviewEvidenceFactKey: 'mraTherapy',
          patientEvidence: [evidence('MRA', '目前未使用', 'mraTherapy')],
          nextActions: ['評估建立 MRA（sMRA 或 nsMRA），並記錄臨床決定。'],
        }),
        recommendation('heart-failure-hfpef-ras', 'HFpEF ACEI／ARB／ARNI（IIb）', {
          status: 'no-action',
          priority: 'routine',
          title: 'ACEI／ARB（Valsartan 80mg） 使用中；ESC 2026 對 HFpEF 只給 Class IIb「可考慮」',
          overviewEvidenceFactKey: 'aceArbTherapy',
          patientEvidence: [
            evidence('ACEI／ARB', '目前用藥中：Valsartan 80mg', 'aceArbTherapy', '2026-08-20'),
          ],
          nextActions: ['依原適應症決定續用或調整，不為心衰竭再加一種 RAS 藥物。'],
        }),
      ].filter((item) => !overrideIds.has(item.id)),
      ...overrides,
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
  betaBlockerTherapy: { zh: '目前未使用', en: 'Not currently taking' },
  finerenoneTherapy: { zh: '目前未使用', en: 'Not currently taking' },
  glp1RaTherapy: { zh: '目前未使用', en: 'Not currently taking' },
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


/**
 * The verbs a card must never lead with. They tell the reader to operate this
 * screen rather than to treat the patient, and the page is scanned for them
 * after rendering as well as inside the pack.
 */
const TOOL_INSTRUCTION = /核對|查找|勾選|點開|先看下方|完成[^。；;]{0,24}再/

describe('heart-failure page model', () => {
  it('drops the pack\'s decision suffix from a row sentence, which the page says on its own line', () => {
    expect(stripDecisionSuffix('HFrEF 適用 MRA，目前無處方 · K 4.2（醫師已決定：今天先不開，2026-09-09）'))
      .toBe('HFrEF 適用 MRA，目前無處方 · K 4.2')
    expect(stripDecisionSuffix('MRA not prescribed (physician decided: not today, 2026-09-09)'))
      .toBe('MRA not prescribed')
    expect(stripDecisionSuffix('無後綴的句子')).toBe('無後綴的句子')
  })


  it('reads the status line in the order the design prints it', () => {
    const board = buildHeartFailureBoard(heartFailureResult(), 'zh-TW', NOW)

    expect(board).toBeDefined()
    expect(board!.phenotypeWord).toBe('HFrEF')
    expect(board!.metrics.map((metric) => metric.factKey)).toEqual([
      'NTproBNP', 'potassium', 'eGFR', 'sodium', 'bloodPressure', 'bodyWeight', 'heartRate',
    ])
    const bp = board!.metrics.find((metric) => metric.factKey === 'bloodPressure')!
    expect(bp.value).toBe('118/72')
    expect(bp.unit).toBe('mmHg')
    expect(bp.ageDays).toBe(3)
    expect(bp.stale).toBe(false)
    // NT-proBNP has an evidence-table row and no value: absent, never invented.
    expect(board!.metrics[0].value).toBeUndefined()
    expect(board!.lvef?.value).toBe('32%')
    expect(board!.phenotype?.id).toBe('heart-failure-phenotype')
    expect(board!.fmtSafety?.id).toBe('heart-failure-fmt-safety')
  })

  /**
   * The BMI is derived, so it earns its slot on the line rather than being
   * asked for: it appears the moment both measurements exist, sits beside the
   * weight it came from, and is neither editable nor separately undoable.
   */
  it('derives the BMI from the height and the weight, beside the weight', () => {
    const bodySize = {
      height: {
        zh: '150 cm（2026-09-09）',
        en: '150 cm (2026-09-09)',
        numericValue: 150,
        unit: 'cm',
        date: '2026-09-09',
      },
      bodyWeight: {
        zh: '70 kg（2026-09-01）',
        en: '70 kg (2026-09-01)',
        numericValue: 70,
        unit: 'kg',
        date: '2026-09-01',
      },
    }
    const board = buildHeartFailureBoard(heartFailureResult(), 'zh-TW', NOW, bodySize)!
    expect(board.metrics.map((metric) => metric.factKey)).toEqual([
      'NTproBNP', 'potassium', 'eGFR', 'sodium', 'bloodPressure', 'bodyWeight', 'bmi', 'heartRate',
    ])
    const bmi = board.metrics.find((metric) => metric.factKey === 'bmi')!
    // 70 / 1.5² = 31.11…
    expect(bmi.value).toBe('31.1')
    expect(bmi.unit).toBe('kg/m²')
    expect(bmi.editable).toBe(false)
    expect(bmi.entered).toBe(false)
    // Dated by the reading that completed it, and the hover carries both.
    expect(bmi.date).toBe('2026-09-09')
    expect(bmi.fullValue).toBe('BMI 31.1 kg/m²（體重 70 kg 2026-09-01 · 身高 150 cm 2026-09-09）')

    // The height is offered to the dialog and printed nowhere on the line.
    expect(board.height.factKey).toBe('height')
    expect(board.height.editable).toBe(true)
    expect(board.height.value).toBe('150')

    // One measurement alone derives nothing, and the line says nothing.
    const weightOnly = buildHeartFailureBoard(
      heartFailureResult(), 'zh-TW', NOW, { bodyWeight: bodySize.bodyWeight },
    )!
    expect(weightOnly.metrics.some((metric) => metric.factKey === 'bmi')).toBe(false)
    expect(weightOnly.height.value).toBeUndefined()
    expect(weightOnly.height.editable).toBe(true)
  })

  it('keeps the pack\'s stale annotation as a flag instead of dropping it', () => {
    const result = heartFailureResult()
    const stalePotassium = evidence('K', '4.9 mmol/L（2026-06-01，已 96 天，超過 30 天窗）', 'potassium', '2026-06-01')
    const stale: CdssResult = {
      ...result,
      recommendations: result.recommendations.map((item) => (
        item.id === 'heart-failure-fmt-safety'
          ? { ...item, patientEvidence: [bloodPressure, heartRate, eGfr, stalePotassium] }
          : { ...item, patientEvidence: item.patientEvidence.filter((row) => !row.factKeys.includes('potassium')) }
      )),
    }

    const potassium = buildHeartFailureBoard(stale, 'zh-TW', NOW)!
      .metrics.find((metric) => metric.factKey === 'potassium')!
    expect(potassium.value).toBe('4.9')
    expect(potassium.stale).toBe(true)
    expect(potassium.fullValue).toContain('已 96 天')
  })

  it('reads each therapy row from the pack card, sentence and decisions included', () => {
    const board = buildHeartFailureBoard(heartFailureResult(), 'zh-TW', NOW)!

    expect(board.pillars.map((pillar) => [pillar.id, pillar.taking, pillar.medicationNames])).toEqual([
      ['heart-failure-ras-inhibition', true, 'Valsartan 80mg'],
      ['heart-failure-beta-blocker', true, 'Bisoprolol 2.5mg'],
      ['heart-failure-mra', false, undefined],
      ['heart-failure-sglt2', true, 'Dapagliflozin 10mg'],
    ])
    expect(board.takingCount).toBe(3)
    // The sentence is the card's own title, never composed here.
    expect(board.pillars[2].sentence).toBe('HFrEF 適用 MRA，目前無處方 · eGFR 48 · K 4.9')
    expect(board.pillars[2].decisionOptions?.map((option) => option.id)).toEqual([
      'prescribed', 'contraindicated-or-intolerant', 'not-today',
    ])
    expect(board.pillars[1].decisionOptions).toBeUndefined()
    expect(board.gdmt?.id).toBe('heart-failure-hfref-gdmt')
  })

  it('consumes the therapies, the pillar card and the FMT safety line, and lists the rest once', () => {
    const board = buildHeartFailureBoard(heartFailureResult(), 'zh-TW', NOW)!

    expect([...board.consumedIds].sort()).toEqual([
      'heart-failure-beta-blocker',
      'heart-failure-fmt-safety',
      'heart-failure-hfref-gdmt',
      'heart-failure-mra',
      'heart-failure-ras-inhibition',
      'heart-failure-sglt2',
    ])
    expect(board.listRows.map((row) => row.id)).toEqual([
      'heart-failure-medication-safety',
      'heart-failure-congestion-diuretic',
      'heart-failure-monitoring',
      'cardiac-rehabilitation',
      'heart-failure-phenotype',
    ])
    // Actionable, then data-needed, then judgement, then done.
    expect(board.listRows.map((row) => row.status)).toEqual([
      'actionable', 'needs-data', 'review', 'review', 'no-action',
    ])
    // Nothing appears twice on the page.
    const rendered = [...board.pillars.map((p) => p.id), ...board.listRows.map((row) => row.id)]
    expect(new Set(rendered).size).toBe(rendered.length)
    expect(board.evaluatedCount).toBe(11)
  })

  it('is not built for any other pack', () => {
    expect(buildHeartFailureBoard(heartFailureResult({ packId: 'ckd-cdss' }), 'zh-TW', NOW)).toBeUndefined()
  })

  it('shows no therapy rows for a pathway that produced none when no facts are given', () => {
    const board = buildHeartFailureBoard(hfpefResult(), 'zh-TW', NOW)!
    expect(board.pillars).toEqual([])
    expect(board.gdmt).toBeUndefined()
    expect(board.phenotypeWord).toBe('未分型')
  })

  it('reads a safety input no module carried straight from the record, and says so', () => {
    const board = buildHeartFailureBoard(phenotypeOnlyResult(), 'zh-TW', NOW, RECORD_ONLY_FACTS)!

    const potassium = board.metrics.find((metric) => metric.factKey === 'potassium')!
    expect(potassium.value).toBe('2.8')
    expect(potassium.date).toBe('2026-08-20')
    expect(potassium.ageDays).toBe(16)
    expect(potassium.evaluated).toBe(false)
    expect(potassium.evidence?.sources?.[0]?.resourceId).toBe('obs-k')
    expect(board.lvef?.value).toBe('32%')
    // Nothing in the record either: still absent, not invented.
    expect(board.metrics.find((metric) => metric.factKey === 'heartRate')?.value).toBeUndefined()
  })

  it('prefers the module\'s own evidence over the record when a module did read the value', () => {
    const board = buildHeartFailureBoard(hfpefResult(), 'zh-TW', NOW, RECORD_ONLY_FACTS)!
    const potassium = board.metrics.find((metric) => metric.factKey === 'potassium')!
    expect(potassium.value).toBe('4.9')
    expect(potassium.evaluated).toBe(true)
  })

  it('shows the HFpEF therapy set when the pack opened the HFpEF pathway', () => {
    const board = buildHeartFailureBoard(hfpefTherapyResult(), 'zh-TW', NOW, HFPEF_FACTS)!

    expect(board.pillarPathway).toBe('hfpEF')
    expect(board.phenotypeWord).toBe('HFpEF')
    expect(board.pillars.map((pillar) => pillar.id)).toEqual([
      'heart-failure-hfpef-sglt2',
      'heart-failure-hfpef-mra',
      'heart-failure-hfpef-glp1',
      'heart-failure-hfpef-ras',
      'heart-failure-hfpef-beta-blocker',
    ])
    // The two classes the guideline scopes out say which scope, and still show
    // what the record holds.
    expect(board.pillars[2].outOfScope).toBe('不適用（BMI 未達 30 或無 BMI，且無 T2DM／肥胖診斷）')
    expect(board.pillars[4].outOfScope).toBe('HFpEF 無建議')
    expect(board.pillars[3].note).toBe('IIb 可考慮')
    for (const pillar of board.pillars) expect(board.consumedIds.has(pillar.id)).toBe(true)
    expect(board.gdmt).toBeUndefined()
  })

  it('lays out no therapy rows at all when neither pathway opened', () => {
    // Four rows of 「本次未判定」 look like an answer and are not one. The
    // record still holds the prescriptions; what it does not hold is a
    // phenotype to judge them against, and the block says so instead.
    const board = buildHeartFailureBoard(hfpefResult(), 'zh-TW', NOW, HFPEF_FACTS)!

    expect(board.pillarPathway).toBeUndefined()
    expect(board.pillars).toEqual([])
    expect(board.takingCount).toBe(0)
    expect(board.gdmt).toBeUndefined()
  })
})

describe('the heart-failure page', () => {
  it('renders exactly three blocks, and nothing between them', () => {
    render(<ClinicalDecisionSupportView result={heartFailureResult()} locale="zh-TW" />)

    expect(screen.getByTestId('cdss-hf-status')).toBeInTheDocument()
    expect(screen.getByTestId('cdss-hf-decisions-block')).toBeInTheDocument()
    expect(screen.getByTestId('cdss-hf-list')).toBeInTheDocument()
    // Everything the three blocks replaced is gone.
    expect(screen.queryByTestId('cdss-clinical-summary')).toBeNull()
    expect(screen.queryByTestId('cdss-hf-headlines')).toBeNull()
    expect(screen.queryByTestId('cdss-hf-congestion-signs')).toBeNull()
    expect(screen.queryByTestId('cdss-module-group-trigger-no-action')).toBeNull()
    expect(screen.queryByTestId('cdss-recommendation-heart-failure-monitoring')).toBeNull()
  })

  it('opens with the phenotype word and every safety number on one line', () => {
    render(<ClinicalDecisionSupportView result={heartFailureResult()} locale="zh-TW" />)

    const status = screen.getByTestId('cdss-hf-status-line')
    expect(within(status).getByTestId('cdss-hf-phenotype-word')).toHaveTextContent('HFrEF')
    expect(within(status).getByTestId('cdss-hf-metric-LVEF')).toHaveTextContent('32%')
    expect(within(status).getByTestId('cdss-hf-metric-bloodPressure')).toHaveTextContent('118/72')
    // A value the record does not hold reads 「無」, not a blank.
    expect(within(status).getByTestId('cdss-hf-metric-NTproBNP')).toHaveAttribute('data-missing', 'true')
    expect(within(status).getByTestId('cdss-hf-metric-NTproBNP')).toHaveTextContent('無')
  })

  it('asks for the symptoms once, and saves each tap on its own', () => {
    const onSave = jest.fn()
    render(
      <ClinicalDecisionSupportView
        result={heartFailureResult()}
        locale="zh-TW"
        clinicVitals={undefined}
        onSaveClinicSymptoms={onSave}
      />,
    )

    fireEvent.click(screen.getByTestId('cdss-hf-symptom-orthopnea'))
    expect(onSave).toHaveBeenLastCalledWith(
      expect.objectContaining({ symptoms: ['orthopnea'], priorSymptoms: [] }),
    )

    // 「過去曾有」 is a mode the same chips are pressed in.
    fireEvent.click(screen.getByTestId('cdss-hf-prior-mode'))
    fireEvent.click(screen.getByTestId('cdss-hf-symptom-pitting-edema'))
    expect(onSave).toHaveBeenLastCalledWith(
      expect.objectContaining({ symptoms: [], priorSymptoms: ['pitting-edema'] }),
    )
    // Nothing untouched is written: an unticked chip is undetermined, not absent.
    expect(onSave).toHaveBeenCalledTimes(2)
  })

  it('offers no entry at all where the surface cannot take one', () => {
    render(<ClinicalDecisionSupportView result={heartFailureResult()} locale="zh-TW" />)
    expect(screen.queryByTestId('cdss-hf-symptoms')).toBeNull()
    expect(screen.queryByTestId('cdss-hf-values-trigger')).toBeNull()
  })

  it('puts one therapy row per class, with the pack\'s sentence and its decisions', () => {
    const onRecord = jest.fn()
    render(
      <ClinicalDecisionSupportView
        result={heartFailureResult()}
        locale="zh-TW"
        onRecordDecision={onRecord}
      />,
    )

    // The heading is the pack's own count, not a second one computed here.
    expect(screen.getByTestId('cdss-hf-decisions-title')).toHaveTextContent('四支柱 3／4 在用 · 缺 MRA')
    expect(screen.queryByTestId('cdss-hf-decisions-note')).toBeNull()
    const mra = screen.getByTestId('cdss-hf-therapy-heart-failure-mra')
    expect(mra).toHaveTextContent('HFrEF 適用 MRA，目前無處方')
    expect(mra).toHaveTextContent('無處方')
    const betaBlocker = screen.getByTestId('cdss-hf-therapy-heart-failure-beta-blocker')
    expect(betaBlocker).toHaveTextContent('使用中')

    fireEvent.click(screen.getByTestId('cdss-hf-decision-heart-failure-mra-prescribed'))
    expect(onRecord).toHaveBeenCalledWith('heart-failure-mra', expect.objectContaining({ option: 'prescribed' }))
    // A class already in use has nothing to decide.
    expect(screen.queryByTestId('cdss-hf-decisions-heart-failure-beta-blocker')).toBeNull()
  })

  it('shows a recorded decision as a quiet line with an undo', () => {
    const onWithdraw = jest.fn()
    const result = heartFailureResult()
    const decided: CdssResult = {
      ...result,
      recommendations: result.recommendations.map((item) => (
        item.id === 'heart-failure-mra'
          ? {
            ...item,
            status: 'no-action' as const,
            title: `${item.title}（醫師已決定：已開立，2026-09-05）`,
            physicianDecision: { option: 'prescribed', recordedAt: '2026-09-05' },
          }
          : item
      )),
    }
    render(
      <ClinicalDecisionSupportView
        result={decided}
        locale="zh-TW"
        onRecordDecision={jest.fn()}
        onWithdrawDecision={onWithdraw}
      />,
    )

    const recorded = screen.getByTestId('cdss-hf-decision-recorded-heart-failure-mra')
    expect(recorded).toHaveTextContent('醫師已決定：已開立')
    expect(screen.queryByTestId('cdss-hf-decision-heart-failure-mra-prescribed')).toBeNull()
    fireEvent.click(screen.getByTestId('cdss-hf-decision-withdraw-heart-failure-mra'))
    expect(onWithdraw).toHaveBeenCalledWith('heart-failure-mra')
  })

  it('shows the FMT safety verdict as one amber line only when it has one', () => {
    const result = heartFailureResult()
    const { rerender } = render(<ClinicalDecisionSupportView result={result} locale="zh-TW" />)
    expect(screen.queryByTestId('cdss-hf-fmt-safety-line')).toBeNull()

    const alerting: CdssResult = {
      ...result,
      recommendations: result.recommendations.map((item) => (
        item.id === 'heart-failure-fmt-safety'
          ? { ...item, status: 'actionable' as const, title: 'FMT 調整前先處理高血鉀 · K 5.8 ≥5.5' }
          : item
      )),
    }
    rerender(<ClinicalDecisionSupportView result={alerting} locale="zh-TW" />)
    const line = screen.getByTestId('cdss-hf-fmt-safety-line')
    expect(line).toHaveTextContent('K 5.8 ≥5.5')
    // Still one block, not a fourth: the line sits inside the decisions block.
    expect(screen.getByTestId('cdss-hf-decisions-block')).toContainElement(line)
  })

  it('lists every remaining module once, done rows included and muted', () => {
    render(<ClinicalDecisionSupportView result={heartFailureResult()} locale="zh-TW" />)

    const list = screen.getByTestId('cdss-hf-list')
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(5)
    expect(within(list).getByTestId('cdss-hf-row-heart-failure-monitoring'))
      .toHaveTextContent('缺 2 項：心律、近期體重')
    // 目前無需處理 stays visible rather than folding into a group.
    expect(within(list).getByTestId('cdss-hf-row-heart-failure-phenotype'))
      .toHaveAttribute('data-status', 'no-action')
    // No evidence column, no guideline chip, no row numbers.
    expect(within(list).queryByTestId('cdss-evidence-preview-heart-failure-monitoring')).toBeNull()
    expect(within(list).queryByTestId('cdss-guideline-chip-heart-failure-monitoring')).toBeNull()
  })

  it('opens the same decision detail from a therapy row and from a list row', () => {
    render(<ClinicalDecisionSupportView result={heartFailureResult()} locale="zh-TW" />)

    fireEvent.click(screen.getByTestId('cdss-hf-therapy-trigger-heart-failure-mra'))
    expect(screen.getByTestId('cdss-hf-detail-heart-failure-mra')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('cdss-hf-row-trigger-heart-failure-congestion-diuretic'))
    expect(screen.getByTestId('cdss-hf-detail-heart-failure-congestion-diuretic')).toBeInTheDocument()
    // One row open at a time.
    expect(screen.queryByTestId('cdss-hf-detail-heart-failure-mra')).toBeNull()
  })

  it('tells the reader nothing about operating the screen', () => {
    const { container } = render(
      <ClinicalDecisionSupportView
        result={heartFailureResult()}
        locale="zh-TW"
        onSaveClinicSymptoms={jest.fn()}
      />,
    )
    expect(container.textContent ?? '').not.toMatch(TOOL_INSTRUCTION)
  })

  it('renders the HFpEF page with its five therapy rows and its guideline note', () => {
    render(<ClinicalDecisionSupportView result={hfpefTherapyResult()} locale="zh-TW" profileFacts={HFPEF_FACTS} />)

    expect(screen.getByTestId('cdss-hf-phenotype-word')).toHaveTextContent('HFpEF')
    expect(screen.getByTestId('cdss-hf-decisions-title')).toHaveTextContent('HFpEF 藥物')
    expect(screen.getByTestId('cdss-hf-decisions-note')).toHaveTextContent('β 阻斷劑無 HFpEF 建議')
    expect(screen.getByTestId('cdss-hf-therapy-heart-failure-hfpef-glp1')).toHaveTextContent('不適用（BMI 未達 30 或無 BMI，且無 T2DM／肥胖診斷）')
    expect(screen.getByTestId('cdss-hf-therapy-note-heart-failure-hfpef-ras')).toHaveTextContent('IIb 可考慮')
  })

  it('says so plainly when neither pathway opened', () => {
    render(<ClinicalDecisionSupportView result={phenotypeOnlyResult()} locale="zh-TW" />)
    expect(screen.getByTestId('cdss-hf-no-pathway')).toHaveTextContent('尚未分型')
    expect(screen.getByTestId('cdss-hf-row-heart-failure-phenotype')).toBeInTheDocument()
  })

  it('leaves every other pack on the generic module table', () => {
    render(<ClinicalDecisionSupportView result={heartFailureResult({ packId: 'ckd-cdss' })} locale="zh-TW" />)
    expect(screen.queryByTestId('cdss-hf-board')).toBeNull()
    expect(screen.getByTestId('cdss-recommendation-heart-failure-ras-inhibition')).toBeInTheDocument()
  })
})

describe('a value the physician corrects on the status line', () => {
  const ENTERED_LVEF = {
    LVEF: {
      factKey: 'LVEF' as const,
      enteredAt: '2026-09-05',
      recordValue: '63.6%（2026-06-24）',
      recordDate: '2026-06-24',
    },
  }

  it('is a flag on the metric, with the value it replaced, not a string match', () => {
    const board = buildHeartFailureBoard(
      heartFailureResult(), 'zh-TW', NOW, undefined, undefined, ENTERED_LVEF,
    )!

    expect(board.lvef).toMatchObject({
      entered: true,
      enteredAt: '2026-09-05',
      recordValue: '63.6%（2026-06-24）',
      recordDate: '2026-06-24',
      editable: true,
    })
    // Everything else on the line is untouched, and still editable.
    const potassium = board.metrics.find((metric) => metric.factKey === 'potassium')!
    expect(potassium.entered).toBe(false)
    expect(potassium.enteredAt).toBeUndefined()
    expect(potassium.editable).toBe(true)
  })

  it('gives LVEF a slot even when nothing holds it, because 「無」 is correctable', () => {
    const board = buildHeartFailureBoard(phenotypeOnlyResult(), 'zh-TW', NOW)!
    expect(board.lvef.factKey).toBe('LVEF')
    expect(board.lvef.editable).toBe(true)
  })

  it('opens one dialog on the pencil, with the record under every box', () => {
    const onSave = jest.fn()
    render(
      <ClinicalDecisionSupportView
        result={heartFailureResult()}
        locale="zh-TW"
        onSaveClinicValues={onSave}
      />,
    )

    fireEvent.click(screen.getByTestId('cdss-hf-values-trigger'))
    expect(screen.getByTestId('cdss-hf-values-dialog')).toBeInTheDocument()
    // Every box says what it is overriding, including the ones holding nothing.
    expect(screen.getByTestId('cdss-hf-value-record-LVEF')).toHaveTextContent('紀錄 32%')
    expect(screen.getByTestId('cdss-hf-value-record-NTproBNP')).toHaveTextContent('紀錄 無')

    fireEvent.change(screen.getByTestId('cdss-hf-value-input-LVEF'), { target: { value: '35' } })
    fireEvent.change(screen.getByTestId('cdss-hf-value-input-potassium'), { target: { value: '5.4' } })
    fireEvent.click(screen.getByTestId('cdss-hf-values-save'))

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0].entries).toEqual({
      LVEF: { value: 35 },
      potassium: { value: 5.4 },
    })
    // A box nobody touched is not an entry: that value stays on the record's.
    expect(onSave.mock.calls[0][0].entries.bloodPressure).toBeUndefined()
    expect(screen.queryByTestId('cdss-hf-values-dialog')).toBeNull()
  })

  it('takes a blood pressure as two boxes, and refuses half of one', () => {
    const onSave = jest.fn()
    render(
      <ClinicalDecisionSupportView
        result={heartFailureResult()}
        locale="zh-TW"
        onSaveClinicValues={onSave}
      />,
    )

    fireEvent.click(screen.getByTestId('cdss-hf-values-trigger'))
    fireEvent.change(screen.getByTestId('cdss-hf-value-input-bloodPressure'), { target: { value: '132' } })
    expect(screen.getByTestId('cdss-hf-values-save')).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('收縮壓與舒張壓要一起填')

    fireEvent.change(screen.getByTestId('cdss-hf-value-input-bloodPressure-diastolic'), { target: { value: '78' } })
    fireEvent.click(screen.getByTestId('cdss-hf-values-save'))
    expect(onSave.mock.calls[0][0].entries.bloodPressure).toEqual({ value: 132, diastolic: 78 })
  })

  it('closes on 取消 and on Esc without saving anything', () => {
    const onSave = jest.fn()
    render(
      <ClinicalDecisionSupportView
        result={heartFailureResult()}
        locale="zh-TW"
        onSaveClinicValues={onSave}
      />,
    )

    fireEvent.click(screen.getByTestId('cdss-hf-values-trigger'))
    fireEvent.change(screen.getByTestId('cdss-hf-value-input-potassium'), { target: { value: '5.5' } })
    fireEvent.click(screen.getByTestId('cdss-hf-values-cancel'))
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.queryByTestId('cdss-hf-values-dialog')).toBeNull()

    fireEvent.click(screen.getByTestId('cdss-hf-values-trigger'))
    fireEvent.change(screen.getByTestId('cdss-hf-value-input-potassium'), { target: { value: '5.5' } })
    fireEvent.keyDown(screen.getByTestId('cdss-hf-values-dialog'), { key: 'Escape' })
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.queryByTestId('cdss-hf-values-dialog')).toBeNull()
  })

  it('opens on what is entered, and takes 「全部撤銷」 after one confirmation', () => {
    const onSave = jest.fn()
    render(
      <ClinicalDecisionSupportView
        result={heartFailureResult()}
        locale="zh-TW"
        clinicVitals={{ entries: { LVEF: { value: 35, enteredAt: '2026-09-05' } }, measuredOn: '2026-09-05' }}
        clinicEntries={ENTERED_LVEF}
        onSaveClinicValues={onSave}
      />,
    )

    fireEvent.click(screen.getByTestId('cdss-hf-values-trigger'))
    expect(screen.getByTestId('cdss-hf-value-input-LVEF')).toHaveValue(35)
    // The helper text under it is still the record's, which is what a blank box
    // and 「全部撤銷」 both fall back to.
    expect(screen.getByTestId('cdss-hf-value-record-LVEF')).toHaveTextContent('紀錄 63.6%')

    const clearAll = screen.getByTestId('cdss-hf-values-clear-all')
    fireEvent.click(clearAll)
    expect(onSave).not.toHaveBeenCalled()
    expect(clearAll).toHaveTextContent('確定全部撤銷')

    fireEvent.click(clearAll)
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ entries: {} }))
    expect(screen.queryByTestId('cdss-hf-values-dialog')).toBeNull()
  })

  it('has nothing to undo when nothing was entered', () => {
    render(
      <ClinicalDecisionSupportView
        result={heartFailureResult()}
        locale="zh-TW"
        onSaveClinicValues={jest.fn()}
      />,
    )
    fireEvent.click(screen.getByTestId('cdss-hf-values-trigger'))
    expect(screen.getByTestId('cdss-hf-values-clear-all')).toBeDisabled()
  })

  it('marks the entered value, says what it replaced, and offers 撤銷', () => {
    const onClear = jest.fn()
    render(
      <ClinicalDecisionSupportView
        result={heartFailureResult()}
        locale="zh-TW"
        clinicEntries={ENTERED_LVEF}
        onClearMetric={onClear}
      />,
    )

    const lvef = screen.getByTestId('cdss-hf-metric-LVEF')
    expect(lvef).toHaveAttribute('data-entered', 'true')
    expect(lvef).toHaveTextContent('門診輸入')
    expect(lvef).toHaveAttribute('title', '紀錄：63.6%（2026-06-24）')

    fireEvent.click(screen.getByTestId('cdss-hf-metric-undo-LVEF'))
    expect(onClear).toHaveBeenCalledWith('LVEF')
    // Nothing else on the line grew an undo it did not earn.
    expect(screen.queryByTestId('cdss-hf-metric-undo-potassium')).toBeNull()
  })

  it('reads the line plainly where the surface can take no correction', () => {
    render(<ClinicalDecisionSupportView result={heartFailureResult()} locale="zh-TW" />)
    expect(screen.queryByTestId('cdss-hf-values-trigger')).toBeNull()
    expect(screen.queryByTestId('cdss-hf-metric-undo-LVEF')).toBeNull()
    expect(screen.getByTestId('cdss-hf-metric-LVEF')).toHaveTextContent('32%')
  })
})
