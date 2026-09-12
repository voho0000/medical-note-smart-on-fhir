/**
 * The visit flow, rendered, wired to the real stores.
 *
 * What it holds is the promise the restructure was for: one question is asked
 * in one place, answering it moves the count, a recommendation can be decided
 * on the row it appears on, and switching to the original board and back does
 * not lose anything the clinician said.
 */
import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { ClinicalDecisionSupportView } from '@/features/clinical-decision-support/renderers/ClinicalDecisionSupportView'
import {
  useClinicVitals,
  useClinicVitalsStore,
} from '@/features/clinical-decision-support/stores/clinic-vitals.store'
import {
  usePhenotypeAnswer,
  usePhenotypeAnswerStore,
} from '@/features/clinical-decision-support/stores/phenotype-answer.store'
import {
  usePhysicianDecisions,
  usePhysicianDecisionsStore,
} from '@/features/clinical-decision-support/stores/physician-decisions.store'
import type { CdssLayout } from '@/features/clinical-decision-support/stores/layout-preference.store'
import type {
  CdssRecommendation,
  CdssResult,
  ClinicalEvidence,
} from '@/features/clinical-decision-support/types'

const PATIENT = 'flow-patient'

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

function heartFailureResult(): CdssResult {
  return {
    title: '心衰竭個人化照護指引',
    summary: '',
    packId: 'heart-failure-cdss',
    packVersion: '1.13.0',
    recommendations: [
      recommendation('heart-failure-phenotype', {
        moduleGroup: 'assessment',
        domain: 'diagnosis',
        status: 'no-action',
        priority: 'routine',
        title: '進入 HFrEF（LVEF <50%） 路徑',
        overviewEvidenceFactKey: 'LVEF',
        patientEvidence: [evidence('LVEF', '32%', 'LVEF', '2026-07-14')],
        physicianInputRequests: [{
          kind: 'hf-suspicion',
          label: '您懷疑這位病人有心衰竭嗎？',
          options: [
            { id: 'suspected', label: '是，懷疑心衰竭' },
            { id: 'not-suspected', label: '否，本次不懷疑' },
          ],
        }],
      }),
      recommendation('heart-failure-mra', {
        status: 'actionable',
        title: 'HFrEF 適用 MRA，目前無處方',
        overviewEvidenceFactKey: 'mraTherapy',
        patientEvidence: [evidence('MRA', '目前未使用', 'mraTherapy')],
        nextActions: ['起始 MRA（spironolactone 12.5–25 mg）'],
      }),
      recommendation('heart-failure-congestion-diuretic', {
        status: 'needs-data',
        title: '鬱血證據表沒有任何已開啟的項目',
        nextActions: ['在本次評估回答鬱血徵象後再決定利尿策略。'],
        evidenceTables: [{
          concept: 'congestion',
          items: [
            {
              id: 'congestion:pitting-edema',
              label: { zh: '下肢水腫', en: 'Pitting oedema' },
              category: 'examination',
              derivability: 'physician-entered',
              direction: 'unknown',
              defaultEnabled: false,
            },
            {
              id: 'congestion:nyha',
              label: { zh: 'NYHA 分級', en: 'NYHA class' },
              category: 'examination',
              derivability: 'physician-entered',
              direction: 'unknown',
              defaultEnabled: false,
            },
          ],
          supportsCount: 0,
          againstCount: 0,
          unknownCount: 2,
          limitations: [],
          evidenceReferences: [],
        }],
      }),
    ],
    notEvaluated: [],
    disclaimer: '本工具不取代臨床判斷。',
  }
}

/**
 * The HFpEF card, with criterion (i) in the state the test is about.
 */
function withHfpEfConfirmation(symptomsState: 'met' | 'undetermined'): CdssResult {
  const base = heartFailureResult()
  return {
    ...base,
    recommendations: [
      ...base.recommendations,
      recommendation('heart-failure-hfpef-diagnosis', {
        moduleGroup: 'assessment',
        domain: 'diagnosis',
        status: 'review',
        title: 'HFpEF 診斷（ESC 2026 §5.2.2）',
        physicianInputRequests: [{
          kind: 'hfpef-diagnosis-confirmation',
          label: '確認 HFpEF 診斷？',
        }],
        diagnosticSummary: {
          verdict: '三個條件皆成立，待醫師確認',
          basis: 'ESC 2026 §5.2.2（PDF p.25）Table 10',
          criteria: [
            {
              id: 'symptoms-signs',
              label: '症狀／徵象',
              state: symptomsState,
              detail: symptomsState === 'met' ? '支持 1 項、反對 0 項' : '第 2、4 題未答',
            },
            { id: 'lvef', label: 'LVEF ≥50% 且未曾 <50%', state: 'met', detail: 'LVEF 58%' },
            { id: 'objective-abnormality', label: '客觀結構／功能異常', state: 'met', detail: 'Table 10 支持 5 項' },
          ],
        },
      } as Partial<CdssRecommendation>),
    ],
  }
}

/**
 * The host around the view: the real stores, and a switch between the two
 * faces, so what a clinician answers in one is what the other reads.
 */
function Harness({ result = heartFailureResult() }: { result?: CdssResult } = {}) {
  const [layout, setLayout] = useState<CdssLayout>('flow')
  const clinicVitals = useClinicVitals(PATIENT)
  const setVitals = useClinicVitalsStore((state) => state.setVitals)
  const clearVitals = useClinicVitalsStore((state) => state.clearVitals)
  const phenotypeAnswer = usePhenotypeAnswer(PATIENT)
  const setPhenotypeAnswer = usePhenotypeAnswerStore((state) => state.setAnswer)
  const decisions = usePhysicianDecisions(PATIENT)
  const recordDecision = usePhysicianDecisionsStore((state) => state.recordDecision)
  const clearDecision = usePhysicianDecisionsStore((state) => state.clearDecision)
  return (
    <div>
      <button type="button" data-testid="switch-layout" onClick={() => setLayout(layout === 'flow' ? 'board' : 'flow')}>
        {layout}
      </button>
      <ClinicalDecisionSupportView
        result={result}
        locale="zh-TW"
        layout={layout}
        patientId={PATIENT}
        clinicVitals={clinicVitals}
        onSaveClinicVitals={(patch) => setVitals(PATIENT, patch)}
        onClearClinicVitals={() => clearVitals(PATIENT)}
        phenotypeAnswer={phenotypeAnswer}
        onAnswerPhenotype={(answer) => setPhenotypeAnswer(PATIENT, answer)}
        physicianDecisions={decisions}
        onRecordDecision={(moduleId, input) => recordDecision(PATIENT, moduleId, input)}
        onClearDecision={(moduleId) => clearDecision(PATIENT, moduleId)}
      />
    </div>
  )
}

function suspectHeartFailure() {
  fireEvent.click(screen.getByTestId('cdss-hf-suspicion-option-suspected'))
}

describe('the visit flow', () => {
  beforeEach(() => {
    localStorage.clear()
    useClinicVitalsStore.setState({ byPatientId: {} })
    usePhenotypeAnswerStore.setState({ byPatientId: {}, hydratedPatientIds: {} })
    usePhysicianDecisionsStore.setState({ byPatientId: {} })
  })

  it('asks about congestion in one place and nowhere else', () => {
    render(<Harness />)
    suspectHeartFailure()

    // One control for 凹陷性水腫 on the whole screen: no board chip strip, and
    // no DP-00 tick-list repeating the same examination.
    expect(screen.getAllByTestId('cdss-hf-flow-sign-pitting-edema')).toHaveLength(1)
    expect(screen.queryByTestId('cdss-hf-congestion-signs')).toBeNull()
    expect(screen.queryByTestId('cdss-hf-symptom-edema')).toBeNull()
    expect(screen.queryByTestId('cdss-hf-compensation-control')).toBeNull()
  })

  it('echoes the answer on the evidence row instead of offering a second control', () => {
    render(<Harness />)
    suspectHeartFailure()
    fireEvent.click(screen.getByTestId('cdss-hf-flow-sign-pitting-edema-absent'))
    // Open the module that carries the congestion table.
    fireEvent.click(screen.getByTestId('cdss-hf-action-expand-heart-failure-congestion-diuretic'))

    const row = screen.getByTestId('cdss-evidence-readonly-congestion:pitting-edema')
    expect(row).toHaveTextContent('無')
    expect(screen.queryByTestId('cdss-evidence-answer-congestion:pitting-edema')).toBeNull()
    expect(screen.queryByTestId('cdss-evidence-nyha-congestion:nyha')).toBeNull()
    expect(screen.getByTestId('cdss-evidence-edit-in-flow-congestion:pitting-edema'))
      .toHaveTextContent('在本次評估修改')
  })

  it('counts down 還有 n 題 as the questions are answered', () => {
    render(<Harness />)
    const remaining = () => screen.getByTestId('cdss-hf-questions-remaining').textContent

    expect(remaining()).toBe('還有 2 題')
    suspectHeartFailure()
    expect(remaining()).toBe('還有 5 題')

    fireEvent.click(screen.getByTestId('cdss-hf-flow-nyha-II'))
    expect(remaining()).toBe('還有 4 題')

    // Question ④ is answered once every 常見 sign has been answered; the
    // 更多 rows stay optional.
    for (const term of ['rales', 'jvp', 'pitting-edema']) {
      fireEvent.click(screen.getByTestId(`cdss-hf-flow-sign-${term}-absent`))
    }
    expect(remaining()).toBe('還有 3 題')

    for (const term of [
      'exertional-dyspnea',
      'orthopnea',
      'paroxysmal-nocturnal-dyspnea',
      'fatigue-exercise-intolerance',
      'reported-ankle-swelling',
      'abdominal-bloating',
    ]) {
      fireEvent.click(screen.getByTestId(`cdss-hf-flow-sign-${term}-not-assessed`))
    }
    expect(remaining()).toBe('還有 2 題')

    fireEvent.click(screen.getByTestId('cdss-hf-flow-compensation-compensated'))
    expect(remaining()).toBe('還有 1 題')
  })

  it('records a decision on the row, with its date and a way to change it', () => {
    render(<Harness />)
    suspectHeartFailure()

    expect(screen.getByTestId('cdss-hf-actions-decided')).toHaveTextContent('已決定 0 / 2')
    fireEvent.click(screen.getByTestId('cdss-hf-decision-heart-failure-mra-prescribed'))

    const recorded = screen.getByTestId('cdss-hf-decision-recorded-heart-failure-mra')
    expect(recorded).toHaveTextContent('已開立')
    expect(recorded).toHaveTextContent(/今日 \d{2}:\d{2}/)
    expect(screen.getByTestId('cdss-hf-actions-decided')).toHaveTextContent('已決定 1 / 2')

    // 「已開立」 does not retire the row: it is still there, and still open to
    // a different decision.
    expect(screen.getByTestId('cdss-hf-action-row-heart-failure-mra')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('cdss-hf-decision-edit-heart-failure-mra'))
    expect(screen.getByTestId('cdss-hf-decision-heart-failure-mra-deferred')).toBeInTheDocument()
  })

  it('asks for a reason when a recommendation is deferred', () => {
    render(<Harness />)
    suspectHeartFailure()
    fireEvent.click(screen.getByTestId('cdss-hf-decision-heart-failure-mra-deferred'))

    const reasons = screen.getByTestId('cdss-hf-decision-reasons-heart-failure-mra')
    expect(within(reasons).getAllByRole('button').length).toBeGreaterThan(1)
    fireEvent.click(screen.getByTestId('cdss-hf-decision-reason-heart-failure-mra-high-potassium'))
    fireEvent.click(screen.getByTestId('cdss-hf-decision-save-heart-failure-mra'))

    expect(screen.getByTestId('cdss-hf-decision-recorded-heart-failure-mra'))
      .toHaveTextContent('K 偏高')
  })

  it('keeps every answer when the reader switches to the original board and back', () => {
    render(<Harness />)
    suspectHeartFailure()
    fireEvent.click(screen.getByTestId('cdss-hf-flow-nyha-III'))
    fireEvent.click(screen.getByTestId('cdss-hf-decision-heart-failure-mra-prescribed'))

    fireEvent.click(screen.getByTestId('switch-layout'))
    expect(screen.getByTestId('cdss-hf-board')).toBeInTheDocument()
    expect(screen.queryByTestId('cdss-hf-visit-flow')).toBeNull()

    fireEvent.click(screen.getByTestId('switch-layout'))
    expect(screen.getByTestId('cdss-hf-question-answer-nyha')).toHaveTextContent('NYHA III')
    expect(screen.getByTestId('cdss-hf-decision-recorded-heart-failure-mra'))
      .toHaveTextContent('已開立')
    expect(screen.getByTestId('cdss-hf-questions-remaining')).toHaveTextContent('還有 4 題')
  })

  it('leads with 「前往第 2 題」 while criterion (i) is undetermined', () => {
    render(<Harness result={withHfpEfConfirmation('undetermined')} />)
    suspectHeartFailure()

    // The useful action is not 「確認」: the symptoms are what would settle the
    // criterion, so the confirmation is offered but does not lead.
    expect(screen.getByTestId('cdss-hf-hfpef-go-to-symptoms')).toHaveTextContent('前往第 2 題')
    expect(screen.getByTestId('cdss-hf-hfpef-confirm')).toBeInTheDocument()
    expect(screen.getByTestId('cdss-hf-hfpef-defer')).toHaveTextContent('暫不確認')
  })

  it('offers the confirmation first once criterion (i) is met, and can be deferred', () => {
    render(<Harness result={withHfpEfConfirmation('met')} />)
    suspectHeartFailure()

    expect(screen.queryByTestId('cdss-hf-hfpef-go-to-symptoms')).toBeNull()
    fireEvent.click(screen.getByTestId('cdss-hf-hfpef-defer'))

    // 「暫不確認」 finishes the question without stating anything.
    expect(screen.getByTestId('cdss-hf-question-answer-hfpef-confirmation'))
      .toHaveTextContent('暫不確認')
    expect(usePhenotypeAnswerStore.getState().byPatientId[PATIENT]?.hfpEfConfirmed)
      .toBe('not-assessed')

    fireEvent.click(screen.getByTestId('cdss-hf-question-edit-hfpef-confirmation'))
    fireEvent.click(screen.getByTestId('cdss-hf-hfpef-confirm'))
    expect(usePhenotypeAnswerStore.getState().byPatientId[PATIENT]?.hfpEfConfirmed).toBe(true)
  })

  it('draws the module list once, not twice', () => {
    render(<Harness />)
    suspectHeartFailure()

    // The generic 個案決策總覽 list is not rendered underneath the flow's own.
    expect(screen.queryByLabelText('個案決策總覽')).toBeNull()
    expect(screen.getAllByTestId('cdss-hf-action-row-heart-failure-mra')).toHaveLength(1)
  })

  it('withholds every control when no patient is loaded', () => {
    render(
      <ClinicalDecisionSupportView
        result={heartFailureResult()}
        locale="zh-TW"
        layout="flow"
      />,
    )

    expect(screen.getByTestId('cdss-hf-questions-read-only')).toHaveTextContent('需載入病人才能作答')
    expect(screen.queryByTestId('cdss-hf-flow-nyha')).toBeNull()
    expect(screen.queryByTestId('cdss-hf-decision-heart-failure-mra')).toBeNull()
  })
})
