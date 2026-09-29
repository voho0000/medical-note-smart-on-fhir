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
import type { VisitMapSurfaces } from '@/features/clinical-decision-support/renderers/visit/visit-surfaces'
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

function Harness({ model, surfaces }: { model: VisitDecisionModel; surfaces?: VisitMapSurfaces }) {
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
      {...(surfaces ? { surfaces } : {})}
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

  it('does not open a step the pack has closed, and says why — still reachable by keyboard', () => {
    render(<Harness model={p1Model()} />)
    expect(step('treatment')).toHaveAttribute('aria-disabled', 'true')
    expect(step('treatment')).toBeEnabled()
    expect(step('treatment')).toHaveTextContent('確診後開啟')
    fireEvent.click(step('treatment'))
    expect(step('treatment')).not.toHaveAttribute('aria-current')
    expect(step('status')).toHaveAttribute('aria-current', 'step')
    expect(step('status')).not.toHaveAttribute('aria-disabled')
  })

  it('moves the page to the step shown when it is pressed again', () => {
    const moved: string[] = []
    Element.prototype.scrollIntoView = function scrollIntoView(this: Element) { moved.push(this.id) }
    render(<Harness model={p4Model()} />)
    fireEvent.click(step('treatment'))
    moved.length = 0
    fireEvent.click(step('treatment'))
    expect(moved).toEqual(['cdss-visit-column-treatment'])
  })

  it('opens a point pressed on the map from the summary in its own section', () => {
    render(<Harness model={p4Model()} />)
    fireEvent.click(step('summary'))
    const tile = screen.getByTestId('cdss-visit-overview-treatment').querySelector<HTMLButtonElement>('button[data-dp="DP-07"]')
    fireEvent.click(tile!)
    expect(step('treatment')).toHaveAttribute('aria-current', 'step')
    expect(screen.getByTestId('cdss-visit-column-summary')).not.toBeVisible()
    expect(screen.getByTestId('cdss-visit-column-treatment')).toBeVisible()
  })

  it('wears no section’s colours on the summary step or the button into it', () => {
    render(<Harness model={p4Model()} />)
    expect(step('summary')).toHaveAttribute('data-section', 'summary')
    fireEvent.click(step('outlook'))
    expect(screen.getByTestId('cdss-visit-next-outlook')).toHaveAttribute('data-section', 'summary')
  })

  it('takes focus to the heading of what a foot button shows, since the button is hidden with its section', () => {
    render(<Harness model={p4Model()} />)
    fireEvent.click(screen.getByTestId('cdss-visit-next-status'))
    expect(document.activeElement).toHaveAttribute('id', 'cdss-visit-column-treatment-title')
    fireEvent.click(step('outlook'))
    fireEvent.click(screen.getByTestId('cdss-visit-next-outlook'))
    expect(document.activeElement).toHaveAttribute('id', 'cdss-visit-column-summary-title')
  })

  it('ends 03 on the summary', () => {
    render(<Harness model={p4Model()} />)
    fireEvent.click(step('outlook'))
    fireEvent.click(screen.getByTestId('cdss-visit-next-outlook'))
    expect(step('summary')).toHaveAttribute('aria-current', 'step')
    expect(screen.getByTestId('cdss-visit-summary-text')).toBeVisible()
  })

  it('asks the every-visit questions in 02 while one is unanswered, and keeps them, answered, until the clinician moves on', () => {
    render(<Harness model={p4Model()} />)
    // 01 asks its own questions and never repeats them as pending, even while one is open.
    expect(screen.queryByTestId('cdss-visit-pending-asks-status')).toBeNull()
    fireEvent.click(step('treatment'))
    const pending = screen.getByTestId('cdss-visit-pending-asks-treatment')
    expect(pending).toBeVisible()
    expect(pending).not.toHaveAttribute('data-done')
    // Answered here, answered for the page: 01's own copy shows it too.
    const worse = within(pending).getByRole('button', { name: '變差' })
    worse.focus()
    fireEvent.click(worse)
    expect(useVisitAnswersStore.getState().byPatientId[PATIENT]?.['dyspnoea-trend']?.value).toBe('worse')
    const inStatus = within(screen.getByTestId('cdss-visit-column-status')).getByRole('button', { name: '變差', hidden: true })
    expect(inStatus).toHaveAttribute('aria-pressed', 'true')
    // P4's weight is prefilled from the record, so nothing is left to ask —
    // but the box stays, marked done, and the button just pressed keeps focus.
    expect(screen.getByTestId('cdss-visit-pending-asks-treatment')).toHaveAttribute('data-done', 'true')
    expect(screen.getByTestId('cdss-visit-pending-asks-treatment')).toHaveTextContent('每次必問已答完')
    expect(document.activeElement).toBe(worse)
    // Leaving the step lets it go; coming back, nothing is carried.
    fireEvent.click(step('outlook'))
    expect(screen.queryByTestId('cdss-visit-pending-asks-outlook')).toBeNull()
    fireEvent.click(step('treatment'))
    expect(screen.queryByTestId('cdss-visit-pending-asks-treatment')).toBeNull()
  })

  it('says when an answer given in 02 opened more to fill in in 01, one press away', () => {
    render(<Harness model={p4Model()} surfaces={{ asksDetail: { label: '其他症狀、徵象與 NYHA', content: <p>fuller</p>, openCount: 3 } }} />)
    expect(step('status')).not.toHaveTextContent('待補')
    fireEvent.click(step('treatment'))
    fireEvent.click(within(screen.getByTestId('cdss-visit-pending-asks-treatment')).getByRole('button', { name: '變差' }))
    // 喘變差 opened the fuller questions in 01, out of sight: 01 says so, and so does the box.
    expect(step('status')).toHaveTextContent('待補 3')
    const toStatus = screen.getByTestId('cdss-visit-pending-asks-to-status-treatment')
    expect(toStatus).toHaveTextContent('待補 3')
    fireEvent.click(toStatus)
    expect(step('status')).toHaveAttribute('aria-current', 'step')
    expect(document.activeElement).toHaveAttribute('id', 'cdss-visit-column-status-title')
  })

  it('gives the questions carried into 02 their own ids, so each group names its own label', () => {
    render(<Harness model={p4Model()} />)
    fireEvent.click(step('treatment'))
    const ids = [...document.querySelectorAll('[id]')].map((element) => element.id)
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([])
    for (const group of screen.getByTestId('cdss-visit-pending-asks-treatment').querySelectorAll('[role="group"]')) {
      const label = document.getElementById(group.getAttribute('aria-labelledby')!)
      expect(screen.getByTestId('cdss-visit-pending-asks-treatment')).toContainElement(label)
    }
  })
})
