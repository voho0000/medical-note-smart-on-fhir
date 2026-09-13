/**
 * The dyslipidemia visit, drawn by the same engine heart failure uses.
 *
 * The pack is the real one throughout — nothing here mocks a recommendation —
 * because the three things worth checking are all contracts with it: that an
 * answer becomes a fact the pack reads, that the reading changes when it does,
 * and that every sentence on screen is one the pack wrote.
 */
import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import {
  HYPERLIPIDEMIA_GUIDELINE_PACK,
  type CdssPatientProfile,
  type CdssResult,
} from '@voho0000/personalized-care'
import { ClinicalDecisionSupportView } from '@/features/clinical-decision-support/renderers/ClinicalDecisionSupportView'
import { buildDyslipidemiaBoard } from '@/features/clinical-decision-support/renderers/dyslipidemia-board'
import { diagnosticSummaryOf } from '@/features/clinical-decision-support/physician-input-contract'
import { buildVisitFlow } from '@/features/clinical-decision-support/visit-flow/build-visit-flow'
import { DYSLIPIDEMIA_VISIT_FLOW_CONFIG } from '@/features/clinical-decision-support/visit-flow/dyslipidemia-visit-flow.config'
import { applyVisitAnswers } from '@/features/clinical-decision-support/utils/apply-visit-answers'
import {
  buildVisitAnswers,
  type VisitAnswerPatch,
  type VisitAnswers,
} from '@/features/clinical-decision-support/stores/visit-answers.store'
import type { PhysicianDecisionMap } from '@/features/clinical-decision-support/stores/physician-decisions.store'

const now = new Date('2026-09-13T10:00:00+08:00')
const f = (v: number | string, date = '2026-07-02') => ({
  zh: String(v), en: String(v),
  ...(typeof v === 'number' ? { numericValue: v } : {}),
  date,
})

const ASCVD_FACTS: CdssPatientProfile['facts'] = {
  ascvdDiagnosis: f('已記載冠狀動脈疾病'),
  age: f(62),
  LDL: f(128),
  nonHDL: f(149),
  HDL: f(43),
  totalCholesterol: f(192),
  triglycerides: f(155),
  eGFR: f(66),
  medicationListOverview: f('Atorvastatin 40 mg'),
  statinTherapy: f('目前用藥中：Atorvastatin 40 mg'),
  ezetimibeTherapy: f('未見處方'),
  pcsk9Therapy: f('未見處方'),
}

function profileOf(facts: CdssPatientProfile['facts'], answers?: VisitAnswers): CdssPatientProfile {
  const base: CdssPatientProfile = {
    id: 'synthetic-lipid-test',
    evaluatedAt: '2026-09-13T00:00:00Z',
    demographics: { sex: 'male' },
    // 表一's six-factor count reads an age with a sex and an HDL-C off the
    // record; the statin context is what makes 「目前用藥中」 a current class
    // rather than a line in a list.
    medicationClassContexts: facts.statinTherapy
      ? { statin: { state: 'confirmed-current', medicationNames: ['Atorvastatin 40 mg'], factKey: 'statinTherapy' } }
      : {},
    facts,
  }
  return applyVisitAnswers(base, answers, DYSLIPIDEMIA_VISIT_FLOW_CONFIG, 'zh-TW')
}

function resultOf(facts: CdssPatientProfile['facts'] = ASCVD_FACTS, answers?: VisitAnswers): CdssResult {
  return HYPERLIPIDEMIA_GUIDELINE_PACK.build({ locale: 'zh-TW', profile: profileOf(facts, answers) })
}

function flowOf(
  facts: CdssPatientProfile['facts'] = ASCVD_FACTS,
  answers?: VisitAnswers,
  decisions: PhysicianDecisionMap = {},
) {
  const result = resultOf(facts, answers)
  const board = buildDyslipidemiaBoard(result, 'zh-TW', now)!
  return buildVisitFlow({
    board, result, isEnglish: false, now, decisions, patientId: 'synthetic-lipid-test',
    ...(answers ? { visitAnswers: answers } : {}),
  }, DYSLIPIDEMIA_VISIT_FLOW_CONFIG)
}

/** The screen with a real answer store behind it, so an answer round-trips. */
function Harness({
  facts = ASCVD_FACTS,
  initialAnswers,
  onRecord = jest.fn(),
}: {
  facts?: CdssPatientProfile['facts']
  initialAnswers?: VisitAnswers
  onRecord?: jest.Mock
}) {
  const [answers, setAnswers] = useState<VisitAnswers>(initialAnswers ?? {})
  const [decisions, setDecisions] = useState<PhysicianDecisionMap>({})
  return (
    <ClinicalDecisionSupportView
      result={resultOf(facts, answers)}
      locale="zh-TW"
      patientId="synthetic-lipid-test"
      visitAnswers={answers}
      onSaveVisitAnswers={(patch: VisitAnswerPatch) => {
        setAnswers((current) => {
          const items = { ...(current[patch.questionId]?.items ?? {}) }
          for (const [term, value] of Object.entries(patch.items ?? {})) {
            if (value === null) delete items[term]
            else items[term] = value
          }
          return {
            ...current,
            [patch.questionId]: {
              ...(Object.keys(items).length ? { items } : {}),
              ...(patch.value === undefined || patch.value === null ? {} : { value: patch.value }),
              modifiedAt: now.toISOString(),
            },
          }
        })
      }}
      physicianDecisions={decisions}
      onRecordDecision={(moduleId, input) => {
        onRecord(moduleId, input)
        setDecisions((current) => ({
          ...current,
          [moduleId]: { ...input, reasons: input.reasons ?? [], recordedAt: now.toISOString() },
        }))
      }}
      onClearDecision={(moduleId) => setDecisions((current) => {
        const next = { ...current }
        delete next[moduleId]
        return next
      })}
    />
  )
}

describe('dyslipidemia visit flow', () => {
  it('draws the same five cards the heart-failure flow does', () => {
    render(<Harness />)
    for (const card of ['steps', 'record-values', 'questions', 'actions', 'follow-up']) {
      expect(screen.getByTestId(`cdss-lipid-${card}`)).toBeInTheDocument()
    }
    expect(screen.getByTestId('cdss-lipid-visit-flow')).toBeInTheDocument()
    // The tabbed five-section face this replaced is gone, and with it the
    // separate 健保條件 page: coverage is now a line on the row it belongs to.
    expect(screen.queryByTestId('cdss-lipid-coverage')).not.toBeInTheDocument()
    expect(screen.queryByTestId('cdss-lipid-risk')).not.toBeInTheDocument()
  })

  it('writes only the risk factors that were answered, and never a blank as a 「no」', () => {
    const answers = buildVisitAnswers([
      { questionId: 'lipid-risk-factors', items: { smoking: 'present', 'premature-cad-family-history': 'absent', 'cac-400': 'not-assessed' } },
    ], now)
    const profile = profileOf(ASCVD_FACTS, answers)
    const matched = profile.facts.physicianLipidRiskFactors?.textEvidence?.matchedTerms ?? []
    expect(matched).toContain('smoking:present')
    expect(matched).toContain('premature-cad-family-history:absent')
    // 「未評估」 writes nothing at all, and neither does a row nobody opened.
    expect(matched.some((term) => term.startsWith('cac-400'))).toBe(false)
    expect(matched.some((term) => term.startsWith('metabolic-waist'))).toBe(false)
  })

  it('settles the NHI Table 1 tier once all three counted factors are answered', () => {
    const primaryPrevention: CdssPatientProfile['facts'] = {
      age: f(50), LDL: f(150), totalCholesterol: f(240), HDL: f(55), eGFR: f(90),
    }
    const tierState = (facts: CdssPatientProfile['facts'], answers?: VisitAnswers) => {
      const risk = resultOf(facts, answers).recommendations
        .find((item) => item.id === 'dyslipidemia-risk-and-target')!
      return Object.fromEntries(
        diagnosticSummaryOf(risk)!.criteria.map((criterion) => [criterion.id, criterion.state]),
      )
    }
    expect(tierState(primaryPrevention)['nhi-table1-tier']).toBe('undetermined')

    // 「無」 is an answer and counts as zero; the tier is a count, so three
    // answers of 「無」 settle it where one unanswered row left it a floor.
    const answered = buildVisitAnswers([
      { questionId: 'lipid-risk-factors', items: { smoking: 'absent', 'premature-cad-family-history': 'absent', 'metabolic-waist': 'absent' } },
    ], now)
    expect(tierState(primaryPrevention, answered)['nhi-table1-tier']).toBe('met')
    // The guideline line is independent and stays undetermined: a primary
    // prevention target needs a risk estimate this record cannot supply, and
    // the step bar says so rather than settling on the coverage tier alone.
    expect(tierState(primaryPrevention, answered)['guideline-risk-category']).toBe('undetermined')
    expect(flowOf(primaryPrevention, answered).steps[0].detail)
      .toBe('指引風險分級：未判定 · 健保表一分級：已判定')

    // One row left unanswered and the count is a floor again.
    const partial = buildVisitAnswers([
      { questionId: 'lipid-risk-factors', items: { smoking: 'absent', 'premature-cad-family-history': 'absent' } },
    ], now)
    expect(tierState(primaryPrevention, partial)['nhi-table1-tier']).toBe('undetermined')
  })

  it('turns a statin intolerance into the pack’s own non-statin headline', () => {
    const tolerated = flowOf(ASCVD_FACTS, buildVisitAnswers([
      { questionId: 'statin-tolerance', value: 'tolerated' },
    ], now))
    const therapyRow = (flow: ReturnType<typeof flowOf>) => flow.actionGroups
      .flatMap((group) => group.rows)
      .find((row) => row.recommendation.id === 'dyslipidemia-lipid-lowering-therapy')!
    expect(therapyRow(tolerated).headline).toBe('加上 ezetimibe')

    const intolerant = flowOf(ASCVD_FACTS, buildVisitAnswers([
      { questionId: 'statin-tolerance', value: 'muscle-symptoms' },
    ], now))
    expect(therapyRow(intolerant).headline).toContain('statin 不耐受')
  })

  it('offers the lipid deferral reasons, not the heart-failure ones', () => {
    render(<Harness />)
    const moduleId = 'dyslipidemia-lipid-lowering-therapy'
    fireEvent.click(screen.getByTestId(`cdss-lipid-decision-${moduleId}-contraindicated`))
    const reasons = screen.getByTestId(`cdss-lipid-decision-reasons-${moduleId}`)
    expect(within(reasons).getByTestId(`cdss-lipid-decision-reason-${moduleId}-statin-muscle-symptoms`))
      .toBeInTheDocument()
    expect(within(reasons).queryByTestId(`cdss-lipid-decision-reason-${moduleId}-mra-hyperkalemia`))
      .not.toBeInTheDocument()
  })

  it('prints the pack’s coverage verdict on the row, and nothing where it says not-applicable', () => {
    render(<Harness />)
    const therapy = screen.getByTestId('cdss-lipid-coverage-dyslipidemia-lipid-lowering-therapy')
    expect(therapy).toHaveAttribute('data-coverage-status', 'covered')
    expect(therapy).toHaveTextContent('健保')
    expect(therapy).toHaveTextContent('符合給付')
    // 血脂追蹤 orders a test, not a drug; the pack says 2.6 has nothing to say
    // about it, so the row carries no coverage line at all.
    expect(screen.queryByTestId('cdss-lipid-coverage-dyslipidemia-monitoring-and-markers'))
      .not.toBeInTheDocument()
  })

  it('dates the next lipid panel from the day the treatment decision was recorded', () => {
    const decisions: PhysicianDecisionMap = {
      'dyslipidemia-lipid-lowering-therapy': {
        decision: 'prescribed', reasons: [], recordedAt: now.toISOString(), packVersion: '0.4.0-poc',
      },
    }
    const flow = flowOf(ASCVD_FACTS, undefined, decisions)
    const line = flow.followUpLines.find((item) => item.id === 'next-lipid-panel')!
    // 2026-09-13 + 4 weeks and + 12 weeks, the ACC/AHA 2026 §3.5 window.
    expect(line.value).toBe('2026-10-11 至 2026-12-06')
    expect(flow.followUpLines.find((item) => item.id === 'nhi-recheck')?.value)
      .toContain('6–8 週')
    // Nothing decided, nothing dated: an interval with no start is not a date.
    expect(flowOf().followUpLines).toHaveLength(0)
  })

  it('records a decision through the same host callback as heart failure', () => {
    const onRecord = jest.fn()
    render(<Harness onRecord={onRecord} />)
    const moduleId = 'dyslipidemia-lipid-lowering-therapy'
    fireEvent.click(screen.getByTestId(`cdss-lipid-decision-${moduleId}-prescribed`))
    expect(onRecord).toHaveBeenCalledWith(moduleId, expect.objectContaining({
      decision: 'prescribed', packVersion: '0.4.0-poc',
    }))
    expect(screen.getByTestId(`cdss-lipid-decision-recorded-${moduleId}`)).toHaveTextContent('已開立')
  })

  it('keeps every pack module reachable, including the completed checks', () => {
    const atGoal: CdssPatientProfile['facts'] = {
      ...ASCVD_FACTS,
      LDL: f(45), nonHDL: f(70), HDL: f(50), triglycerides: f(100),
      totalCholesterol: f(150), lipoproteinA: f(20), apolipoproteinB: f(65),
    }
    const result = resultOf(atGoal)
    render(<Harness facts={atGoal} />)
    // 目前無需處理 opens folded, with the module names on the folded line.
    const folded = screen.queryByTestId('cdss-lipid-action-group-trigger-no-action')
    if (folded) fireEvent.click(folded)
    const listed = [
      ...result.recommendations,
      ...(result.automatedChecks ?? []).flatMap((check) => check.recommendation ? [check.recommendation] : []),
    ].filter((item) => item.id !== 'dyslipidemia-risk-and-target')
    for (const recommendation of listed) {
      const row = screen.getByTestId(`cdss-lipid-action-row-${recommendation.id}`)
      fireEvent.click(within(row).getByTestId(`cdss-lipid-action-expand-${recommendation.id}`))
      expect(screen.getByTestId(`cdss-semantic-card-${recommendation.id}`)).toBeInTheDocument()
    }
    // 風險與目標 is question 1's reading, not a row: it is read above the
    // questions and never listed twice.
    expect(screen.queryByTestId('cdss-lipid-action-row-dyslipidemia-risk-and-target'))
      .not.toBeInTheDocument()
    expect(screen.getByTestId('cdss-lipid-risk-reading')).toBeInTheDocument()
  })

  it('puts a severe triglyceride reading in the safety group, ahead of everything else', () => {
    const result = resultOf({ ...ASCVD_FACTS, triglycerides: f(1200) })
    expect(buildDyslipidemiaBoard(result, 'zh-TW', now)?.alerts[0])
      .toMatchObject({ status: 'review', priority: 'high' })
    const flow = flowOf({ ...ASCVD_FACTS, triglycerides: f(1200) })
    expect(flow.actionGroups[0].id).toBe('safety')
    expect(flow.actionGroups[0].rows[0].recommendation.id).toBe('dyslipidemia-severe-triglycerides')
    expect(flow.nextStep.tone).toBe('safety')
  })

  it('does not confuse a missing value with one at goal', () => {
    const result = HYPERLIPIDEMIA_GUIDELINE_PACK.build({
      locale: 'zh-TW', profile: { id: 'empty', facts: {} },
    })
    render(<ClinicalDecisionSupportView result={result} locale="zh-TW" />)
    const ldl = screen.getByTestId('cdss-lipid-flow-metric-LDL')
    expect(ldl).toHaveAttribute('data-missing', 'true')
    expect(ldl).toHaveTextContent('紀錄無值')
    expect(screen.getByTestId('cdss-lipid-flow-metric-nonHDL'))
      .toHaveTextContent('同日 TC 與 HDL-C 可算出')
  })

  it('keeps the original board and the classic list reachable', () => {
    const result = resultOf()
    const { rerender } = render(
      <ClinicalDecisionSupportView result={result} locale="en" layout="classic" />,
    )
    expect(screen.queryByTestId('cdss-lipid-visit-flow')).not.toBeInTheDocument()
    rerender(<ClinicalDecisionSupportView result={result} locale="zh-TW" layout="board" />)
    expect(screen.queryByTestId('cdss-lipid-visit-flow')).not.toBeInTheDocument()
    // And the board still refuses a result from another pack.
    expect(buildDyslipidemiaBoard({ ...result, packId: 'heart-failure-cdss' }, 'en')).toBeUndefined()
  })
})
