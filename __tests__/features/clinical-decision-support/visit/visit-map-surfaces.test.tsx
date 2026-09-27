/**
 * Nothing drops out of the decision map.
 *
 * Every input surface the heart-failure and atrial-fibrillation pages carry on
 * their other layouts is reachable inside the map — the same components, over
 * the same stores — each placed where the clinician reaches for it:
 *
 * HF: the clinical-values editor (status line, and every stale value there);
 * 本次評估's symptom, sign, NYHA and compensation questions under the asks as
 * 「其他症狀、徵象與 NYHA」, open at a first assessment and when 喘 or 體重
 * come back worse; the diagnosis confirmation, the diagnostic questions and the
 * HFpEF scores with their calculator in DP-00/01/34's cards; the record values
 * with the rhythm panel and the care timeline at 01's foot.
 *
 * AF: the clinic-measurements form; every structured question group, each in
 * the card of the point it feeds and under 「其他問答」 when the model carries
 * no such point; the rate-or-rhythm choice in DP-17/18's card; the record's AF
 * inputs at 01's foot.
 *
 * And the fast path holds: nothing but the folded DP-03 line sits between the
 * asks and the queue's first primary button.
 */
import { useMemo, useState } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import {
  ATRIAL_FIBRILLATION_GUIDELINE_PACK as AF_PACK,
  type CdssPatientProfile,
} from '@voho0000/personalized-care'
import { ClinicalDecisionSupportView } from '@/features/clinical-decision-support/renderers/ClinicalDecisionSupportView'
import { focusVisitFlowTarget } from '@/features/clinical-decision-support/renderers/HeartFailureVisitFlow'
import type { VisitDecisionModel } from '@/features/clinical-decision-support/types'
import type { CdssRecommendation, CdssResult, ClinicalEvidence } from '@/features/clinical-decision-support/types'
import { applyAfCalculatorResults } from '@/features/clinical-decision-support/utils/af-calculators'
import { buildHfpefReading } from '@/features/clinical-decision-support/utils/hfpef-scores'
import type { Autofill, AutofillValue } from '@/features/medical-calculator/hooks/use-lab-autofill.hook'
import { useClinicVitals, useClinicVitalsStore } from '@/features/clinical-decision-support/stores/clinic-vitals.store'
import { usePhenotypeAnswer, usePhenotypeAnswerStore } from '@/features/clinical-decision-support/stores/phenotype-answer.store'
import { usePhysicianDecisions, usePhysicianDecisionsStore } from '@/features/clinical-decision-support/stores/physician-decisions.store'
import { useVisitAnswerRecord, useVisitAnswersStore, visitAnswersOf } from '@/features/clinical-decision-support/stores/visit-answers.store'
import { useAfAnswers, useAfAnswersStore } from '@/features/clinical-decision-support/stores/af-answers.store'
import { useHfpefInputsStore } from '@/features/clinical-decision-support/stores/hfpef-inputs.store'
import { afAsks, p1Model, p3Model, p5Model, point } from './visit-model.fixtures'

jest.mock('@/src/application/hooks/clinical-data/use-clinical-data-query.hook', () => ({
  useClinicalData: () => ({ diagnosticReports: [] }),
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const webStreams = require('node:stream/web')
for (const name of ['TransformStream', 'ReadableStream', 'WritableStream'] as const) {
  if (typeof (globalThis as Record<string, unknown>)[name] === 'undefined') {
    ;(globalThis as Record<string, unknown>)[name] = webStreams[name]
  }
}

const PATIENT = 'surfaces-patient'

/* ----------------------------------------------------------- HF fixtures */

function evidence(label: string, value: string, factKey: string, date?: string): ClinicalEvidence {
  return {
    label,
    value,
    factKeys: [factKey],
    ...(date ? { sources: [{ resourceType: 'Observation', resourceId: `${factKey}-${date}`, date }] } : {}),
  }
}

function recommendation(id: string, input: Partial<CdssRecommendation> & { physicianInputRequests?: unknown } = {}): CdssRecommendation {
  return {
    id, moduleName: `模組 ${id}`, moduleGroup: 'treatment', domain: 'medication', priority: 'medium', status: 'review',
    title: `判斷 ${id}`, recommendation: `建議 ${id}`, rationale: `理由 ${id}`, patientEvidence: [],
    nextActions: [`下一步 ${id}`], guidelineReferences: [], safetyBoundary: `邊界 ${id}`,
    ...input,
  } as CdssRecommendation
}

/** A heart-failure result whose visit flow asks every 本次評估 question, HFpEF confirmation included. */
function heartFailureResult(): CdssResult {
  return {
    title: '心衰竭個人化照護指引',
    summary: '',
    packId: 'heart-failure-cdss',
    packVersion: 'test-hf',
    recommendations: [
      recommendation('heart-failure-phenotype', {
        moduleGroup: 'assessment', domain: 'diagnosis', status: 'no-action', priority: 'routine',
        title: '進入 HFpEF 路徑', overviewEvidenceFactKey: 'LVEF',
        patientEvidence: [evidence('LVEF', '58%', 'LVEF', '2026-07-14')],
        physicianInputRequests: [{
          kind: 'hf-suspicion',
          label: '您懷疑這位病人有心衰竭嗎？',
          options: [{ id: 'suspected', label: '是，懷疑心衰竭' }, { id: 'not-suspected', label: '否，本次不懷疑' }],
        }],
      }),
      recommendation('heart-failure-mra', {
        status: 'actionable', title: 'MRA', overviewEvidenceFactKey: 'mraTherapy',
        patientEvidence: [evidence('MRA', '目前未使用', 'mraTherapy')],
      }),
      recommendation('heart-failure-congestion-diuretic', {
        status: 'needs-data', title: '鬱血',
        evidenceTables: [{
          concept: 'congestion',
          items: [
            { id: 'congestion:pitting-edema', label: { zh: '下肢水腫', en: 'Pitting oedema' }, category: 'examination', derivability: 'physician-entered', direction: 'unknown', defaultEnabled: false },
            { id: 'congestion:nyha', label: { zh: 'NYHA 分級', en: 'NYHA class' }, category: 'examination', derivability: 'physician-entered', direction: 'unknown', defaultEnabled: false },
          ],
          supportsCount: 0, againstCount: 0, unknownCount: 2, limitations: [], evidenceReferences: [],
        }],
      } as Partial<CdssRecommendation>),
      recommendation('heart-failure-hfpef-diagnosis', {
        moduleGroup: 'assessment', domain: 'diagnosis', status: 'review', title: 'HFpEF 診斷',
        physicianInputRequests: [{ kind: 'hfpef-diagnosis-confirmation', label: '確認 HFpEF 診斷？' }],
        diagnosticSummary: {
          verdict: '三個條件皆成立，待醫師確認',
          basis: 'ESC 2026 §5.2.2',
          criteria: [
            { id: 'symptoms-signs', label: '症狀／徵象', state: 'met', detail: '支持 1 項' },
            { id: 'lvef', label: 'LVEF ≥50%', state: 'met', detail: 'LVEF 58%' },
          ],
        },
      } as Partial<CdssRecommendation>),
    ],
    notEvaluated: [],
    disclaimer: '',
  }
}

const ECHO: Record<string, number> = { averageEe: 13.2, ee: 13.2, trv: 3.1, pasp: 58, lavi: 36, lvmi: 118, rwt: 0.44, wall: 12 }

const AUTOFILL: Autofill = {
  sex: 'female',
  clinicalSelects: {
    rhythm: { value: 'sr', date: '2026-05-25', testName: 'EKG' },
    afHistory: { value: 'no', date: '2026-05-25', testName: 'EKG' },
    antihypertensives: { value: 'yes', date: '2026-09-12', testName: '用藥' },
  },
  resolve: (source): AutofillValue | undefined => {
    if (!source) return undefined
    if (source.kind === 'age') return { value: 76, unit: 'y', date: '' }
    if (source.kind === 'bmi') return { value: 26.1, unit: 'kg/m²', date: '2026-09-12' }
    if (source.kind === 'echo') {
      const value = ECHO[source.key]
      return value === undefined ? undefined : { value, unit: '', date: '2026-07-14', testName: '心臟超音波', obsId: 'echo-1', resourceType: 'DiagnosticReport' }
    }
    return undefined
  },
}

const HFPEF_PROFILE: CdssPatientProfile = {
  id: PATIENT,
  evaluatedAt: '2026-09-27T09:00:00+08:00',
  facts: { LVEF: { zh: '58%', en: '58%', numericValue: 58, unit: '%', date: '2026-07-14' } },
}

function HfHarness({ model }: { model: VisitDecisionModel }) {
  const clinicVitals = useClinicVitals(PATIENT)
  const phenotypeAnswer = usePhenotypeAnswer(PATIENT)
  const decisions = usePhysicianDecisions(PATIENT)
  const answerRecord = useVisitAnswerRecord(PATIENT)
  const visitAnswers = useMemo(() => visitAnswersOf(answerRecord), [answerRecord])
  const hfpefReading = useMemo(() => buildHfpefReading({ profile: HFPEF_PROFILE, autofill: AUTOFILL }), [])
  return (
    <ClinicalDecisionSupportView
      result={heartFailureResult()}
      locale="zh-TW"
      layout="map"
      patientId={PATIENT}
      visitModel={model}
      clinicVitals={clinicVitals}
      onSaveClinicVitals={(patch) => useClinicVitalsStore.getState().setVitals(PATIENT, patch)}
      onClearClinicVitals={() => useClinicVitalsStore.getState().clearVitals(PATIENT)}
      phenotypeAnswer={phenotypeAnswer}
      onAnswerPhenotype={(answer) => usePhenotypeAnswerStore.getState().setAnswer(PATIENT, answer)}
      physicianDecisions={decisions}
      onRecordDecision={(key, input) => usePhysicianDecisionsStore.getState().recordDecision(PATIENT, key, input)}
      onClearDecision={(key) => usePhysicianDecisionsStore.getState().clearDecision(PATIENT, key)}
      visitAnswers={visitAnswers}
      onVisitAnswer={(id, value) => useVisitAnswersStore.getState().answer(PATIENT, id, value)}
      hfpefReading={hfpefReading}
      onSaveHfpefInputs={(patch) => useHfpefInputsStore.getState().setInputs(PATIENT, patch)}
    />
  )
}

/* ----------------------------------------------------------- AF fixtures */

const AF_PROFILE: CdssPatientProfile = {
  id: PATIENT,
  evaluatedAt: '2026-09-27T00:00:00+08:00',
  demographics: { sex: 'female' },
  facts: {
    age: { numericValue: 78, zh: '78 歲', en: '78 years' },
    atrialFibrillationDiagnosis: { zh: 'I48.0', en: 'I48.0' },
    heartRate: { numericValue: 88, zh: '88 bpm', en: '88 bpm', date: '2026-09-10' },
  },
}

/** The AF model with the rate/rhythm points and the comorbidity point the fixture lacks. */
function afModel({ withComorbidityPoint = true }: { withComorbidityPoint?: boolean } = {}): VisitDecisionModel {
  const model = p3Model()
  return {
    ...model,
    asks: afAsks(),
    points: [
      ...model.points,
      point({ dp: 'DP-01', label: '診斷或追蹤', state: 'done', block: 'status', group: '⓪', source: 'af' }),
      point({ dp: 'DP-17', label: '心率控制', state: 'info', group: 'R', source: 'af' }),
      ...(withComorbidityPoint ? [point({ dp: 'DP-21', label: '共病與風險因子', state: 'info', group: 'C', source: 'af' })] : []),
    ],
  }
}

function AfHarness({ model }: { model: VisitDecisionModel }) {
  const clinicVitals = useClinicVitals(PATIENT)
  const decisions = usePhysicianDecisions(PATIENT)
  const answers = useAfAnswers(PATIENT)
  const [result] = useState(() => AF_PACK.build({ profile: applyAfCalculatorResults(AF_PROFILE), locale: 'zh-TW' }))
  return (
    <ClinicalDecisionSupportView
      result={result}
      locale="zh-TW"
      layout="map"
      patientId={PATIENT}
      visitModel={model}
      profileFacts={AF_PROFILE.facts}
      afAnswers={answers}
      onAfAnswer={(id, value) => useAfAnswersStore.getState().answer(PATIENT, id, value)}
      clinicVitals={clinicVitals}
      onSaveClinicVitals={(patch) => useClinicVitalsStore.getState().setVitals(PATIENT, patch)}
      onClearClinicVitals={() => useClinicVitalsStore.getState().clearVitals(PATIENT)}
      physicianDecisions={decisions}
      onRecordDecision={(key, input) => usePhysicianDecisionsStore.getState().recordDecision(PATIENT, key, input)}
      visitAnswers={{}}
      onVisitAnswer={jest.fn()}
    />
  )
}

/* ----------------------------------------------------------- helpers */

function cell(dp: string, source = 'hf'): HTMLElement {
  const found = [...document.querySelectorAll<HTMLElement>('[data-testid="cdss-visit-map"] button[data-dp]')]
    .find((element) => element.dataset.dp === dp && element.dataset.source === source)
  if (!found) throw new Error(`no map cell ${dp}`)
  return found
}

function asksDetail(): HTMLDetailsElement {
  return screen.getByTestId('cdss-visit-asks-detail') as HTMLDetailsElement
}

/** 本次評估 unlocks once DP-00 is answered; a follow-up chart has answered it. */
function suspected() {
  usePhenotypeAnswerStore.setState({ byPatientId: { [PATIENT]: { hfSuspicion: 'suspected', answeredOn: '2026-09-27' } }, hydratedPatientIds: { [PATIENT]: true } })
}

function openStatusColumn() {
  const fold = screen.queryByTestId('cdss-visit-status-fold')
  if (fold) fireEvent.click(fold)
}

beforeEach(() => {
  Element.prototype.scrollIntoView = jest.fn()
  localStorage.clear()
  useClinicVitalsStore.setState({ byPatientId: {} })
  usePhenotypeAnswerStore.setState({ byPatientId: {}, hydratedPatientIds: {} })
  usePhysicianDecisionsStore.setState({ byPatientId: {}, hydratedPatientIds: {} })
  useVisitAnswersStore.setState({ byPatientId: {}, hydratedPatientIds: {} })
  useHfpefInputsStore.setState({ byPatientId: {}, hydratedPatientIds: {} })
  useAfAnswersStore.setState({ patientId: PATIENT, answers: {} })
})

/* ----------------------------------------------------------- HF */

describe('HF surfaces on the decision map', () => {
  it('opens the clinical-values editor from the status line, and at one value from a stale value', () => {
    const model: VisitDecisionModel = {
      ...p5Model(),
      keyValues: [{ key: 'LVEF', label: 'LVEF', value: '30%', date: '2025-06-01', stale: true }],
    }
    render(<HfHarness model={model} />)
    fireEvent.click(screen.getByTestId('cdss-visit-edit-values'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toHaveTextContent('LVEF')
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })

    const stale = document.querySelector<HTMLButtonElement>('[data-visit-edit-value="LVEF"]')!
    expect(stale).toHaveAccessibleName(/修改 LVEF（已超過窗期）/)
    fireEvent.click(stale)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('folds 「其他症狀、徵象與 NYHA」 at follow-up, with the symptom, sign, NYHA and compensation questions inside', () => {
    render(<HfHarness model={p5Model()} />)
    const detail = asksDetail()
    expect(detail.open).toBe(false)
    expect(within(detail).getByTestId('cdss-visit-asks-detail-toggle')).toHaveTextContent('其他症狀、徵象與 NYHA')
    for (const id of ['symptoms', 'signs', 'nyha', 'compensation']) {
      expect(within(detail).getByTestId(`cdss-hf-question-${id}`)).toBeInTheDocument()
    }
    // The diagnostic questions live with the diagnosis points, not here.
    expect(within(detail).queryByTestId('cdss-hf-question-hf-suspicion')).toBeNull()

    // Fast path: nothing but the folded line between the asks and the queue.
    const between: Element[] = []
    for (let node = screen.getByTestId('cdss-visit-asks').nextElementSibling; node && node !== screen.getByTestId('cdss-visit-queue'); node = node.nextElementSibling) between.push(node)
    expect(between).toEqual([detail])
  })

  it('opens it when breathlessness comes back worse, and says why', () => {
    suspected()
    render(<HfHarness model={p5Model()} />)
    fireEvent.click(document.querySelector('[data-visit-ask="dyspnoea-trend"][data-value="worse"]')!)
    expect(asksDetail().open).toBe(true)
    expect(screen.getByTestId('cdss-visit-asks-detail-reason')).toHaveTextContent('喘變差，已展開完整評估')
    fireEvent.click(screen.getByTestId('cdss-hf-flow-nyha-III'))
    expect(useClinicVitalsStore.getState().byPatientId[PATIENT]?.nyhaClass?.value).toBe('III')
  })

  it('opens it for a card that sends the clinician to a question inside it', async () => {
    suspected()
    render(<HfHarness model={p5Model()} />)
    expect(asksDetail().open).toBe(false)
    act(() => focusVisitFlowTarget({ kind: 'question', questionId: 'symptoms' }))
    await waitFor(() => expect(asksDetail().open).toBe(true))
    // Still open after the next render: the screen's own state followed the jump.
    fireEvent.click(document.querySelector('[data-visit-ask="weight-trend"][data-value="down"]')!)
    expect(asksDetail().open).toBe(true)
  })

  it('opens it at a first assessment', () => {
    render(<HfHarness model={p1Model()} />)
    expect(asksDetail().open).toBe(true)
    expect(screen.getByTestId('cdss-visit-asks-detail-reason')).toHaveTextContent('初次評估')
  })

  it('carries the diagnosis confirmation, the diagnostic questions and the HFpEF calculator in DP-01’s card', () => {
    render(<HfHarness model={p5Model()} />)
    openStatusColumn()
    fireEvent.click(cell('DP-01'))
    const detail = screen.getByTestId('cdss-visit-detail')
    expect(within(detail).getByTestId('cdss-diagnosis-confirmation')).toBeInTheDocument()
    expect(within(detail).getByTestId('cdss-hf-question-hf-suspicion')).toBeInTheDocument()
    fireEvent.click(within(detail).getByTestId('cdss-hf-suspicion-option-suspected'))
    expect(usePhenotypeAnswerStore.getState().byPatientId[PATIENT]?.hfSuspicion).toBe('suspected')
    const scores = within(screen.getByTestId('cdss-visit-detail')).getByTestId('cdss-hf-hfpef-scores')
    fireEvent.click(within(scores).getAllByRole('button', { name: /^開啟 / })[0])
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('offers the same diagnostic assessment from DP-00 and DP-34, one card at a time', () => {
    render(<HfHarness model={p1Model()} />)
    fireEvent.click(cell('DP-00'))
    expect(within(screen.getByTestId('cdss-visit-detail')).getByTestId('cdss-visit-hf-diagnostic-assessment')).toBeInTheDocument()
    fireEvent.click(cell('DP-34'))
    expect(screen.getAllByTestId('cdss-visit-hf-diagnostic-assessment')).toHaveLength(1)
  })

  it('keeps the record values with the rhythm panel and the course at 01’s foot, even when 01 is folded', () => {
    render(<HfHarness model={p5Model()} />)
    expect(screen.getByTestId('cdss-visit-column-status')).toHaveAttribute('data-folded', 'true')
    const foot = screen.getByTestId('cdss-visit-hf-record-foot')
    expect(foot).toHaveTextContent('臨床數值、心律與病程時間軸')
    expect(within(foot).getByTestId('cdss-hf-record-values')).toBeInTheDocument()
    expect(within(foot).getByText('心律')).toBeInTheDocument()
    fireEvent.click(within(foot).getByTestId('cdss-hf-record-values-edit'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('sends a card’s physician row to the question under the asks rather than asking twice', () => {
    suspected()
    render(<HfHarness model={p5Model()} />)
    // One control for 凹陷性水腫 on the whole map.
    fireEvent.click(asksDetail().querySelector('summary')!)
    expect(screen.getAllByTestId('cdss-hf-flow-sign-pitting-edema')).toHaveLength(1)
  })
})

/* ----------------------------------------------------------- AF */

describe('AF surfaces on the decision map', () => {
  it('opens the clinic-measurements form from the status line', () => {
    render(<AfHarness model={afModel()} />)
    fireEvent.click(screen.getByTestId('cdss-visit-edit-values'))
    expect(screen.getByTestId('cdss-visit-af-clinic-vitals')).toBeInTheDocument()
  })

  it('asks symptoms, bleeding and adverse effects under the asks', () => {
    render(<AfHarness model={afModel()} />)
    const detail = asksDetail()
    expect(within(detail).getByTestId('cdss-visit-asks-detail-toggle')).toHaveTextContent('其他症狀、出血與副作用')
    const groups = within(detail).getByTestId('cdss-af-question-groups').dataset.groups!.split(' ')
    expect(groups).toEqual(expect.arrayContaining(['followup', 'bleeding']))
  })

  it('places every question group on the point it feeds', () => {
    render(<AfHarness model={afModel()} />)
    const groupsIn = (dp: string) => {
      fireEvent.click(cell(dp, 'af'))
      const detail = screen.getByTestId('cdss-visit-detail')
      return [...detail.querySelectorAll<HTMLElement>('[data-af-question-group]')].map((element) => element.dataset.afQuestionGroup)
    }
    expect(groupsIn('DP-07')).toEqual(expect.arrayContaining(['stroke', 'antithrombotic']))
    expect(groupsIn('DP-08')).toEqual(['safety'])
    expect(groupsIn('DP-13')).toEqual(['bleedingRisk'])
    expect(groupsIn('DP-21')).toEqual(['comorbidity'])
    expect(groupsIn('DP-04')).toEqual(['screening'])
    fireEvent.click(screen.getByTestId('cdss-visit-map-show-all'))
    expect(groupsIn('DP-01')).toEqual(['diagnosis'])
  })

  it('puts the rate-or-rhythm choice in DP-17’s card, opening that strategy’s questions', () => {
    render(<AfHarness model={afModel()} />)
    fireEvent.click(cell('DP-17', 'af'))
    const detail = screen.getByTestId('cdss-visit-detail')
    expect(within(detail).getByTestId('af-control-strategy')).toBeInTheDocument()
    fireEvent.click(within(detail).getByRole('radio', { name: /Rate control/ }))
    expect(within(detail).getByTestId('cdss-af-question-groups').dataset.groups).toBe('rate')
    fireEvent.click(within(detail).getByRole('radio', { name: /Rhythm control/ }))
    expect(within(detail).queryByTestId('cdss-af-question-groups')?.dataset.groups ?? 'nhi').toBe('nhi')
  })

  it('puts a group with no point to live under at its column’s 「其他問答」', () => {
    render(<AfHarness model={afModel({ withComorbidityPoint: false })} />)
    const other = screen.getByTestId('cdss-visit-other-questions-treatment')
    expect(other).toHaveTextContent('其他問答')
    expect([...other.querySelectorAll<HTMLElement>('[data-af-question-group]')].map((element) => element.dataset.afQuestionGroup))
      .toContain('comorbidity')
  })

  it('writes an answer given on the map to the same AF answers', () => {
    render(<AfHarness model={afModel()} />)
    fireEvent.click(cell('DP-13', 'af'))
    const group = screen.getByTestId('cdss-visit-detail').querySelector<HTMLElement>('[data-af-question-group="bleedingRisk"]')!
    fireEvent.click(group.querySelector('summary')!)
    const yes = within(group).getAllByRole('button', { name: '有' })[0]
    fireEvent.click(yes)
    expect(Object.values(useAfAnswersStore.getState().answers)).toContain(true)
  })

  it('keeps the record’s AF inputs at 01’s foot', () => {
    render(<AfHarness model={afModel()} />)
    const foot = screen.getByTestId('cdss-visit-af-record')
    expect(foot).toHaveTextContent('病歷與本次量測')
    expect(within(foot).getByTestId('cdss-af-metric-heartRate')).toHaveTextContent('88 bpm')
  })
})
