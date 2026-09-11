/**
 * The visit as a model: which step the clinician is on, which single next step
 * outranks the rest, and what the list of today's actions is grouped into.
 *
 * Pure input, pure output. The ordering rules are the part of this screen that
 * can be wrong in a way a reader would not notice — a safety alert sitting
 * below an unanswered question, a step that says 「完成」 with a row nobody
 * decided — so they are checked here rather than through a rendered tree.
 */
import {
  buildHeartFailureVisitFlow,
} from '@/features/clinical-decision-support/renderers/heart-failure-visit-flow'
import { buildHeartFailureBoard } from '@/features/clinical-decision-support/renderers/heart-failure-board'
import {
  buildClinicVitals,
  type ClinicVitals,
} from '@/features/clinical-decision-support/stores/clinic-vitals.store'
import type { PhenotypeAnswer } from '@/features/clinical-decision-support/stores/phenotype-answer.store'
import type { PhysicianDecisionMap } from '@/features/clinical-decision-support/stores/physician-decisions.store'
import type {
  CdssRecommendation,
  CdssResult,
  ClinicalEvidence,
} from '@/features/clinical-decision-support/types'

const NOW = new Date('2026-09-11T14:05:00+08:00')

function evidence(label: string, value: string, factKey: string, date?: string): ClinicalEvidence {
  return {
    label,
    value,
    factKeys: [factKey],
    ...(date
      ? { sources: [{ resourceType: 'Observation', resourceId: `${factKey}-${date}`, date }] }
      : {}),
  }
}

const lvef = evidence('LVEF', '32%', 'LVEF', '2026-07-14')
const potassium = evidence('K', '4.9 mmol/L', 'potassium', '2026-08-25')

function recommendation(
  id: string,
  input: Partial<CdssRecommendation> & { physicianInputRequests?: unknown } = {},
): CdssRecommendation {
  return {
    id,
    moduleName: `模組 ${id}`,
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
  } as CdssRecommendation
}

/** The DP-00 card, carrying the pack's own question and its two option labels. */
function phenotypeCard(extra: Partial<CdssRecommendation> = {}): CdssRecommendation {
  return recommendation('heart-failure-phenotype', {
    moduleGroup: 'assessment',
    domain: 'diagnosis',
    status: 'no-action',
    priority: 'routine',
    title: '進入 HFrEF（LVEF <50%） 路徑',
    overviewEvidenceFactKey: 'LVEF',
    patientEvidence: [lvef],
    physicianInputRequests: [{
      kind: 'hf-suspicion',
      label: '您懷疑這位病人有心衰竭嗎？',
      options: [
        { id: 'suspected', label: '是，懷疑心衰竭' },
        { id: 'not-suspected', label: '否，本次不懷疑' },
      ],
    }],
    ...extra,
  })
}

function result(overrides: Partial<CdssResult> = {}): CdssResult {
  return {
    title: '心衰竭個人化照護指引',
    summary: '',
    packId: 'heart-failure-cdss',
    packVersion: '1.13.0',
    recommendations: [
      phenotypeCard(),
      recommendation('heart-failure-medication-safety', {
        moduleGroup: 'monitoring',
        domain: 'safety',
        status: 'actionable',
        priority: 'high',
        title: '目前處方掃到 ESC 點名的 1 類藥物：NSAID',
        overviewEvidenceFactKey: 'hfHarmfulNsaid',
        patientEvidence: [evidence('NSAID', '目前用藥中：Diclofenac 50mg', 'hfHarmfulNsaid', '2026-08-25')],
        nextActions: ['停用 diclofenac：HFrEF 應避免 NSAID'],
      }),
      recommendation('heart-failure-hfref-gdmt', {
        status: 'review',
        priority: 'high',
        title: 'HFrEF 四大 FMT 支柱已確認 3/4 類',
        patientEvidence: [lvef],
      }),
      recommendation('heart-failure-ras-inhibition', {
        status: 'actionable',
        title: 'HFrEF 目前用 ACEI／ARB，建議換成 ARNI',
        overviewEvidenceFactKey: 'aceArbTherapy',
        patientEvidence: [
          evidence('ACEI／ARB', '目前用藥中：Valsartan 80mg', 'aceArbTherapy', '2026-08-20'),
        ],
        nextActions: ['ARB → ARNI（sacubitril/valsartan）'],
      }),
      recommendation('heart-failure-mra', {
        status: 'actionable',
        title: 'HFrEF 適用 MRA，目前無處方',
        overviewEvidenceFactKey: 'mraTherapy',
        patientEvidence: [evidence('MRA', '目前未使用', 'mraTherapy'), potassium],
        missingData: [],
        nextActions: ['起始 MRA（spironolactone 12.5–25 mg）'],
      }),
      recommendation('heart-failure-beta-blocker', {
        status: 'no-action',
        priority: 'routine',
        title: '已有具 HFrEF 實證的 β 阻斷劑處方',
        overviewEvidenceFactKey: 'hfEvidenceBetaBlockerTherapy',
        patientEvidence: [
          evidence('β 阻斷劑', '目前用藥中：Bisoprolol 2.5mg', 'hfEvidenceBetaBlockerTherapy', '2026-08-20'),
        ],
        nextActions: ['依最高耐受劑量持續 β 阻斷劑'],
      }),
      recommendation('heart-failure-sglt2', {
        status: 'no-action',
        priority: 'routine',
        title: '已有 SGLT2i 處方',
        overviewEvidenceFactKey: 'sglt2Therapy',
        patientEvidence: [
          evidence('SGLT2i', '目前用藥中：Dapagliflozin 10mg', 'sglt2Therapy', '2026-08-20'),
        ],
        nextActions: ['SGLT2i 使用中，維持'],
      }),
      recommendation('heart-failure-monitoring', {
        moduleGroup: 'monitoring',
        domain: 'monitoring',
        status: 'needs-data',
        title: '缺 NT-proBNP 基準',
        missingData: ['NT-proBNP'],
        nextActions: ['抽 NT-proBNP 作為基準；1 週後追蹤 K 與腎功能。'],
      }),
      recommendation('heart-failure-iron', {
        status: 'no-action',
        priority: 'routine',
        title: '鐵缺乏目前無需處理',
        nextActions: ['本次無需處理'],
      }),
    ],
    notEvaluated: [],
    disclaimer: '',
    ...overrides,
  }
}

function flowFor(input: {
  result?: CdssResult
  clinicVitals?: ClinicVitals
  phenotypeAnswer?: PhenotypeAnswer
  decisions?: PhysicianDecisionMap
  patientId?: string | undefined
} = {}) {
  const packResult = input.result ?? result()
  const board = buildHeartFailureBoard(packResult, 'zh-TW', NOW)
  if (!board) throw new Error('the heart-failure board should build for this pack')
  return buildHeartFailureVisitFlow({
    board,
    result: packResult,
    isEnglish: false,
    now: NOW,
    ...(input.clinicVitals ? { clinicVitals: input.clinicVitals } : {}),
    ...(input.phenotypeAnswer ? { phenotypeAnswer: input.phenotypeAnswer } : {}),
    decisions: input.decisions ?? {},
    patientId: 'patientId' in input ? input.patientId : 'p1',
  })
}

const SUSPECTED: PhenotypeAnswer = {
  hfSuspicion: 'suspected',
  answeredOn: '2026-09-11',
  modifiedAt: { hfSuspicion: '2026-09-11T06:05:00.000Z' },
}

/** Everything questions 2–5 can be answered with, in one statement. */
function answeredVitals(): ClinicVitals {
  return buildClinicVitals({
    nyhaClass: 'II',
    signAnswers: {
      'pitting-edema': 'absent',
      orthopnea: 'absent',
      'paroxysmal-nocturnal-dyspnea': 'absent',
      jvp: 'not-assessed',
      rales: 'not-assessed',
    },
    compensationStatus: 'compensated',
    entries: { systolic: { value: 118 }, diastolic: { value: 72 }, heartRate: { value: 76 } },
  }, NOW)
}

describe('the next step', () => {
  it('puts an undecided safety alert above an unanswered question 1', () => {
    // A harmful prescription is harmful whether or not this clinician is
    // asking about heart failure today, so it outranks the gate itself.
    const flow = flowFor()

    expect(flow.nextStep.tone).toBe('safety')
    expect(flow.nextStep.message).toContain('先處理安全警訊')
    expect(flow.nextStep.message).toContain('NSAID')
    expect(flow.nextStep.target).toMatchObject({
      kind: 'action',
      moduleId: 'heart-failure-medication-safety',
    })
    expect(flow.nextStep.actionLabel).toBe('看第 1 列')
  })

  it('falls to the first unanswered question once the alert is decided', () => {
    const flow = flowFor({
      decisions: {
        'heart-failure-medication-safety': {
          decision: 'contraindicated',
          reasons: [],
          recordedAt: NOW.toISOString(),
          packVersion: '1.13.0',
        },
      },
    })

    expect(flow.nextStep.tone).toBe('primary')
    expect(flow.nextStep.message).toBe('接下來：您懷疑這位病人有心衰竭嗎？')
    expect(flow.nextStep.target).toEqual({ kind: 'question', questionId: 'hf-suspicion' })
    // On the first open, the clues the record already holds are named, so the
    // reader does not have to hunt for them to answer.
    expect(flow.nextStep.hint).toContain('LVEF 32%')
  })

  it('falls to the first undecided row once every question is answered', () => {
    const decided: PhysicianDecisionMap = {
      'heart-failure-medication-safety': {
        decision: 'contraindicated',
        reasons: [],
        recordedAt: NOW.toISOString(),
        packVersion: '1.13.0',
      },
    }
    const flow = flowFor({
      phenotypeAnswer: SUSPECTED,
      clinicVitals: answeredVitals(),
      decisions: decided,
    })

    expect(flow.openQuestionCount).toBe(0)
    expect(flow.nextStep.tone).toBe('primary')
    expect(flow.nextStep.message).toBe('接下來：ARB → ARNI（sacubitril/valsartan）')
    expect(flow.nextStep.target).toMatchObject({
      kind: 'action',
      moduleId: 'heart-failure-ras-inhibition',
    })
  })

  it('says the visit is complete, with the pack\'s follow-up sentence, once nothing is left', () => {
    const decisions: PhysicianDecisionMap = Object.fromEntries(
      [
        'heart-failure-medication-safety',
        'heart-failure-hfref-gdmt',
        'heart-failure-ras-inhibition',
        'heart-failure-mra',
        'heart-failure-beta-blocker',
        'heart-failure-sglt2',
        'heart-failure-monitoring',
      ].map((id) => [id, {
        decision: 'prescribed' as const,
        reasons: [],
        recordedAt: NOW.toISOString(),
        packVersion: '1.13.0',
      }]),
    )
    const flow = flowFor({
      phenotypeAnswer: SUSPECTED,
      clinicVitals: answeredVitals(),
      decisions,
    })

    expect(flow.decidedCount).toBe(flow.decidableCount)
    expect(flow.nextStep.tone).toBe('ok')
    expect(flow.nextStep.message).toContain('本次完成：複製摘要到病歷')
    // The follow-up clause is the pack's own sentence, never the host's.
    expect(flow.nextStep.message).toContain('1 週後追蹤 K 與腎功能')
    expect(flow.nextStep.target).toEqual({ kind: 'copy' })
  })
})

describe('the step bar', () => {
  it('opens with confirmation in progress and nothing else started', () => {
    const flow = flowFor()
    expect(flow.steps.map((step) => [step.id, step.state])).toEqual([
      ['confirm', 'current'],
      ['assess', 'todo'],
      ['act', 'current'],
      ['record', 'todo'],
    ])
    expect(flow.steps[1].detail).toBe('答「是」後開放')
  })

  it('counts the questions left, and names the phenotype once it is settled', () => {
    const flow = flowFor({ phenotypeAnswer: SUSPECTED })
    const [confirm, assess] = flow.steps

    expect(confirm.state).toBe('done')
    expect(confirm.detail).toContain('是')
    expect(confirm.detail).toContain('HFrEF')
    expect(confirm.detail).toContain('LVEF 32%')
    // Question 5 can be answered before anyone opens the pathway, so four are
    // outstanding here, not five.
    expect(assess.state).toBe('current')
    expect(assess.detail).toBe('還有 4 題')
  })

  it('marks the visit not applicable when the clinician does not suspect heart failure', () => {
    const flow = flowFor({
      phenotypeAnswer: { hfSuspicion: 'not-suspected', answeredOn: '2026-09-11' },
    })

    expect(flow.steps[0].state).toBe('na')
    expect(flow.steps[1].state).toBe('na')
    expect(flow.openQuestionCount).toBe(0)
  })
})

describe('the questions', () => {
  it('locks 2–4 until question 1 is answered, and never locks the measurements', () => {
    const flow = flowFor()
    const states = Object.fromEntries(flow.questions.map((item) => [item.id, item.state]))

    expect(states['hf-suspicion']).toBe('open')
    expect(states.nyha).toBe('locked')
    expect(states.congestion).toBe('locked')
    expect(states.compensation).toBe('locked')
    expect(states['clinic-vitals']).toBe('open')
    expect(flow.questions.find((item) => item.id === 'nyha')?.lockedReason)
      .toBe('回答第 1 題後開放')
  })

  it('folds 2–4 away and drops the count when the answer is 「否」', () => {
    const flow = flowFor({
      phenotypeAnswer: { hfSuspicion: 'not-suspected', answeredOn: '2026-09-11' },
    })

    const nyha = flow.questions.find((item) => item.id === 'nyha')
    expect(nyha?.state).toBe('locked')
    expect(nyha?.lockedReason).toBe('本次不懷疑心衰竭，其餘題目略過。')
    expect(flow.openQuestionCount).toBe(0)
    // Only what is dangerous whatever the diagnosis is still listed.
    expect(flow.actionGroups.map((group) => group.id)).toEqual(['safety'])
  })

  it('counts 「未評估」 as an answer and never as a negative', () => {
    const flow = flowFor({
      phenotypeAnswer: SUSPECTED,
      clinicVitals: buildClinicVitals({ nyhaClass: 'not-assessed' }, NOW),
    })
    const nyha = flow.questions.find((item) => item.id === 'nyha')

    expect(nyha?.state).toBe('answered')
    expect(nyha?.answerText).toBe('未評估')
  })

  it('asks the pack\'s own question in the pack\'s own words', () => {
    const flow = flowFor()
    const first = flow.questions[0]

    expect(first.label).toBe('您懷疑這位病人有心衰竭嗎？')
    expect(first.request?.options?.map((option) => option.label))
      .toEqual(['是，懷疑心衰竭', '否，本次不懷疑'])
  })

  it('raises the LVEF gate only where the pack asked for it', () => {
    expect(flowFor().questions.some((item) => item.id === 'lvef-phenotype')).toBe(false)

    const asked = result()
    const withGate = {
      ...asked,
      recommendations: asked.recommendations.map((item) => (
        item.id === 'heart-failure-phenotype'
          ? phenotypeCard({
            physicianInputRequests: [
              {
                kind: 'hf-suspicion',
                label: '您懷疑這位病人有心衰竭嗎？',
                options: [
                  { id: 'suspected', label: '是，懷疑心衰竭' },
                  { id: 'not-suspected', label: '否，本次不懷疑' },
                ],
              },
              { kind: 'lvef-phenotype', label: '這位病人的 LVEF 是多少？', options: [] },
            ],
          } as Partial<CdssRecommendation>)
          : item
      )),
    }
    const gated = flowFor({ result: withGate, phenotypeAnswer: SUSPECTED })
    const gate = gated.questions.find((item) => item.id === 'lvef-phenotype')

    expect(gate?.number).toBe('1b')
    // The gate belongs to step ①; it does not move 「還有 n 題」.
    expect(gate?.counted).toBe(false)
    expect(gated.steps[0].state).toBe('current')
  })
})

describe("today's actions", () => {
  it('lists the four pillars as ordinary rows carrying what the patient is on', () => {
    const flow = flowFor({ phenotypeAnswer: SUSPECTED })
    const medication = flow.actionGroups.find((group) => group.id === 'actionable')
    const ids = medication?.rows.map((row) => row.recommendation.id)

    expect(ids).toEqual([
      'heart-failure-ras-inhibition',
      'heart-failure-beta-blocker',
      'heart-failure-mra',
      'heart-failure-sglt2',
      'heart-failure-hfref-gdmt',
    ])
    const ras = medication?.rows.find((row) => row.recommendation.id === 'heart-failure-ras-inhibition')
    expect(ras?.medications).toBe('Valsartan 80mg')
    expect(ras?.headline).toBe('ARB → ARNI（sacubitril/valsartan）')
    // A pillar already prescribed keeps its row and its buttons: 「目前無需
    // 處理」 is a status, not a reason to hide the decision.
    const sglt2 = medication?.rows.find((row) => row.recommendation.id === 'heart-failure-sglt2')
    expect(sglt2?.status).toBe('no-action')
    expect(sglt2?.decisionKind).toBe('medication')
  })

  it('gives 目前無需處理 no buttons, folds it, and names what it holds', () => {
    const flow = flowFor({ phenotypeAnswer: SUSPECTED })
    const done = flow.actionGroups.find((group) => group.id === 'no-action')

    expect(done?.collapsedByDefault).toBe(true)
    expect(done?.summary).toContain('模組 heart-failure-iron')
    expect(done?.rows.every((row) => row.decisionKind === 'none')).toBe(true)
    expect(done?.rows.every((row) => row.index === undefined)).toBe(true)
  })

  it('numbers the decidable rows continuously and offers a test row two buttons', () => {
    const flow = flowFor({ phenotypeAnswer: SUSPECTED })
    const rows = flow.actionGroups.flatMap((group) => group.rows)

    expect(rows.filter((row) => row.index !== undefined).map((row) => row.index))
      .toEqual([1, 2, 3, 4, 5, 6, 7])
    const test = rows.find((row) => row.recommendation.id === 'heart-failure-monitoring')
    expect(test?.decisionKind).toBe('test')
    expect(flow.decidableCount).toBe(7)
  })

  it('never lists the phenotype gate or the HFpEF confirmation as something to do', () => {
    // They are questions 1, 1b and 1c. A row that says 「answer the question」
    // beside the question itself is the duplication this screen removed.
    const flow = flowFor({ phenotypeAnswer: SUSPECTED })
    const ids = flow.actionGroups.flatMap((group) => group.rows.map((row) => row.recommendation.id))

    expect(ids).not.toContain('heart-failure-phenotype')
    expect(ids).not.toContain('heart-failure-hfpef-diagnosis')
  })

  it('carries the basis from the pack\'s own overview evidence', () => {
    const flow = flowFor({ phenotypeAnswer: SUSPECTED })
    const mra = flow.actionGroups
      .flatMap((group) => group.rows)
      .find((row) => row.recommendation.id === 'heart-failure-mra')

    expect(mra?.basis).toBe('MRA：目前未使用')
  })
})

describe('the record card', () => {
  it('lists every answered field with its own date, and nothing unanswered', () => {
    const flow = flowFor({ phenotypeAnswer: SUSPECTED, clinicVitals: answeredVitals() })
    const labels = flow.carriedFields.map((field) => field.label)

    expect(labels).toContain('NYHA')
    expect(labels).toContain('收縮壓')
    expect(labels).toContain('代償狀態')
    expect(flow.carriedFields.every((field) => field.date.length > 0)).toBe(true)
    // Nothing was asked about a body height this visit, so nothing is listed.
    expect(labels).not.toContain('身高')
  })

  it('writes a four-line summary in the words already on screen', () => {
    const flow = flowFor({ phenotypeAnswer: SUSPECTED, clinicVitals: answeredVitals() })
    const lines = flow.summaryText.split('\n')

    expect(lines).toHaveLength(4)
    expect(lines[0]).toContain('LVEF 32%')
    expect(lines[1]).toContain('NYHA：NYHA II')
    expect(lines[1]).toContain('下肢水腫：無')
    expect(lines[2]).toContain('118/72')
    expect(lines[3]).toContain('待決定')
  })
})

describe('without a patient', () => {
  it('says so rather than offering controls that have nowhere to write', () => {
    expect(flowFor({ patientId: undefined }).readOnly).toBe(true)
    expect(flowFor().readOnly).toBe(false)
  })
})
