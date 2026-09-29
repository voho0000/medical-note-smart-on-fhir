/**
 * The visit, step by step: 01 現況, 02 治療, 03 預後與計畫, then 本次摘要 —
 * named at the head of the working area with what each still needs, so where
 * the clinician is and what is left are always in view. The every-visit
 * questions follow the clinician into 02 and 03 while unanswered (their
 * answers decide points there), and 03 ends on the summary, the visit's last
 * step.
 */
import { useMemo } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { VisitDecisionScreen } from '@/features/clinical-decision-support/renderers/visit/VisitDecisionScreen'
import type { VisitDecisionModel } from '@/features/clinical-decision-support/types'
import {
  usePhysicianDecisions,
  usePhysicianDecisionsStore,
} from '@/features/clinical-decision-support/stores/physician-decisions.store'
import {
  useVisitAnswerRecord,
  useVisitAnswersStore,
  visitAnswersOf,
} from '@/features/clinical-decision-support/stores/visit-answers.store'
import { p1Model, p4Model } from './visit-model.fixtures'

const PATIENT = 'steps-patient'

function Harness({ model }: { model: VisitDecisionModel }) {
  const decisions = usePhysicianDecisions(PATIENT)
  const record = useVisitAnswerRecord(PATIENT)
  const answers = useMemo(() => visitAnswersOf(record), [record])
  const now = useMemo(() => new Date(), [])
  return (
    <VisitDecisionScreen
      model={model}
      isEnglish={false}
      now={now}
      packVersion="test-1"
      screenKey={`${PATIENT}:${model.packId}`}
      decisions={decisions}
      onRecordDecision={(key, input) => usePhysicianDecisionsStore.getState().recordDecision(PATIENT, key, input)}
      onClearDecision={(key) => usePhysicianDecisionsStore.getState().clearDecision(PATIENT, key)}
      answers={answers}
      onAnswer={(id, value) => useVisitAnswersStore.getState().answer(PATIENT, id, value)}
      modules={new Map()}
      unmappedModules={[]}
      renderDetail={() => null}
    />
  )
}

function step(name: 'status' | 'treatment' | 'outlook' | 'summary'): HTMLButtonElement {
  return screen.getByTestId(`cdss-visit-step-${name}`) as HTMLButtonElement
}

beforeEach(() => {
  localStorage.clear()
  usePhysicianDecisionsStore.setState({ byPatientId: {}, hydratedPatientIds: {} })
  useVisitAnswersStore.setState({ byPatientId: {}, hydratedPatientIds: {} })
  Element.prototype.scrollIntoView = jest.fn()
})

describe('the visit, step by step', () => {
  it('names every step with what it still needs, and goes to any in one press', () => {
    render(<Harness model={p4Model()} />)
    const steps = screen.getByTestId('cdss-visit-steps')
    expect(within(steps).getAllByRole('button').map((button) => button.dataset.testid)).toEqual([
      'cdss-visit-step-status', 'cdss-visit-step-treatment', 'cdss-visit-step-outlook', 'cdss-visit-step-summary',
    ])
    // Where the visit is.
    expect(step('status')).toHaveAttribute('aria-current', 'step')
    // What 01 still needs, as its section says it: P4's breathlessness is unanswered.
    expect(step('status')).toHaveTextContent('待答 1')
    expect(screen.getByTestId('cdss-visit-section-toggle-status')).toHaveTextContent('待答 1')

    fireEvent.click(step('outlook'))
    expect(step('outlook')).toHaveAttribute('aria-current', 'step')
    expect(screen.getByTestId('cdss-visit-column-outlook')).toBeVisible()
    expect(screen.getByTestId('cdss-visit-column-status')).not.toBeVisible()

    fireEvent.click(step('summary'))
    expect(step('summary')).toHaveAttribute('aria-current', 'step')
    expect(screen.getByTestId('cdss-visit-column-summary')).toBeVisible()
    expect(screen.getByTestId('cdss-visit-summary-copy')).toBeVisible()
    expect(step('summary')).toHaveTextContent('尚未記錄')
  })

  it('does not open a step the pack has closed, and says why', () => {
    render(<Harness model={p1Model()} />)
    expect(step('treatment')).toBeDisabled()
    expect(step('treatment')).toHaveTextContent('確診後開啟')
    expect(step('status')).toBeEnabled()
  })

  it('ends 03 on the summary', () => {
    render(<Harness model={p4Model()} />)
    fireEvent.click(step('outlook'))
    fireEvent.click(screen.getByTestId('cdss-visit-next-outlook'))
    expect(step('summary')).toHaveAttribute('aria-current', 'step')
    expect(screen.getByTestId('cdss-visit-summary-text')).toBeVisible()
  })

  it('asks the every-visit questions in 02 while one is unanswered, and stops once both are', () => {
    render(<Harness model={p4Model()} />)
    fireEvent.click(step('treatment'))
    const pending = screen.getByTestId('cdss-visit-pending-asks-treatment')
    expect(pending).toBeVisible()
    // Answered here, answered for the page: 01 has it too.
    fireEvent.click(within(pending).getByRole('button', { name: '變差' }))
    expect(useVisitAnswersStore.getState().byPatientId[PATIENT]?.['dyspnoea-trend']?.value).toBe('worse')
    // P4's weight is prefilled from the record, so with breathlessness answered nothing is left to ask.
    expect(screen.queryByTestId('cdss-visit-pending-asks-treatment')).toBeNull()
    // 01 never repeats its own questions as pending.
    fireEvent.click(step('status'))
    expect(screen.queryByTestId('cdss-visit-pending-asks-status')).toBeNull()
  })
})
