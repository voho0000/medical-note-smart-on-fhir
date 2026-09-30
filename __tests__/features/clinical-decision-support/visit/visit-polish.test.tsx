/**
 * What makes the map read as it works: a fold looks folded (its chevron), a
 * lone choice looks like the press it is, and on a narrow panel the list of
 * every point folds under its title so the steps and the details come first.
 */
import { useMemo } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { PhysicianInputRequestPanel } from '@/features/clinical-decision-support/renderers/PhysicianInputRequestPanel'
import { MapFold } from '@/features/clinical-decision-support/renderers/visit/MapFold'
import { VisitDecisionScreen } from '@/features/clinical-decision-support/renderers/visit/VisitDecisionScreen'
import type { PhysicianInputRequest } from '@/features/clinical-decision-support/physician-input-contract'
import type { VisitDecisionModel } from '@/features/clinical-decision-support/types'
import {
  usePhysicianDecisions,
  usePhysicianDecisionsStore,
} from '@/features/clinical-decision-support/stores/physician-decisions.store'
import { useVisitAnswersStore } from '@/features/clinical-decision-support/stores/visit-answers.store'
import { p4Model } from './visit-model.fixtures'

const PATIENT = 'polish-patient'

function Harness({ model }: { model: VisitDecisionModel }) {
  const decisions = usePhysicianDecisions(PATIENT)
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
      answers={{}}
      modules={new Map()}
      unmappedModules={[]}
      renderDetail={() => null}
    />
  )
}

beforeEach(() => {
  localStorage.clear()
  usePhysicianDecisionsStore.setState({ byPatientId: {}, hydratedPatientIds: {} })
  useVisitAnswersStore.setState({ byPatientId: {}, hydratedPatientIds: {} })
  Element.prototype.scrollIntoView = jest.fn()
})

describe('a fold on the map', () => {
  it('carries the chevron every fold on the page has, and no browser marker', () => {
    render(<MapFold label="病程時間軸" testId="fold"><p>timeline</p></MapFold>)
    const summary = screen.getByTestId('fold').querySelector('summary')!
    expect(summary).toHaveTextContent('病程時間軸')
    expect(summary.querySelector('svg')).not.toBeNull()
    expect(summary).toHaveClass('list-none', '[&::-webkit-details-marker]:hidden')
    expect(screen.getByTestId('fold')).not.toHaveAttribute('open')
  })
})

describe('a lone diagnosis choice', () => {
  const request = (options: { id: string; label: string }[]): PhysicianInputRequest => ({
    kind: 'hf-suspicion',
    label: '診斷：HFrEF 還是 HFpEF？',
    options,
  })

  it('reads as a press, not a radio with nothing beside it', () => {
    const onAnswer = jest.fn()
    render(
      <PhysicianInputRequestPanel
        requests={[request([{ id: 'hfref', label: 'HFrEF（LVEF <50%）' }])]}
        recommendationId="heart-failure-phenotype"
        isEnglish={false}
        onAnswer={onAnswer}
        now={new Date('2026-09-29T09:00:00+08:00')}
      />,
    )
    const radio = screen.getByTestId('cdss-hf-suspicion-option-hfref')
    // Still one choice of a group for assistive technology; the circle is not drawn.
    expect(radio).toHaveAttribute('type', 'radio')
    expect(radio).toHaveClass('sr-only')
    fireEvent.click(screen.getByText('HFrEF（LVEF <50%）'))
    expect(onAnswer).toHaveBeenCalledWith(expect.objectContaining({ diagnosis: 'hfrEF' }))
  })

  it('keeps the radios where there is a choice to make', () => {
    render(
      <PhysicianInputRequestPanel
        requests={[request([{ id: 'hfref', label: 'HFrEF' }, { id: 'hfpef', label: 'HFpEF' }])]}
        recommendationId="heart-failure-phenotype"
        isEnglish={false}
        onAnswer={jest.fn()}
      />,
    )
    expect(screen.getByTestId('cdss-hf-suspicion-option-hfref')).not.toHaveClass('sr-only')
    expect(screen.getByTestId('cdss-hf-suspicion-option-hfpef')).not.toHaveClass('sr-only')
  })
})

describe('the map on a narrow panel', () => {
  // jsdom has no width: the map is stacked, as on a phone.
  it('folds the list of every point under its title, the steps and details first', () => {
    render(<Harness model={p4Model()} />)
    const fold = screen.getByTestId('cdss-visit-map-fold')
    const list = screen.getByTestId('cdss-visit-sections')
    expect(fold).toHaveAttribute('aria-expanded', 'false')
    expect(fold).toHaveAttribute('aria-controls', list.id)
    expect(list).toHaveAttribute('data-folded', 'true')
    fireEvent.click(fold)
    expect(fold).toHaveAttribute('aria-expanded', 'true')
    expect(list).not.toHaveAttribute('data-folded')
    // A point picked from it: the list folds, and its card opens in its section.
    fireEvent.click(within(list).getAllByRole('button').find((button) => button.dataset.dp === 'DP-07')!)
    expect(list).toHaveAttribute('data-folded', 'true')
    expect(screen.getByTestId('cdss-visit-step-treatment')).toHaveAttribute('aria-current', 'step')
  })

  it('unfolds for a search, and needs no fold button while one is typed', () => {
    render(<Harness model={p4Model()} />)
    fireEvent.change(screen.getByTestId('cdss-visit-map-search'), { target: { value: 'mra' } })
    expect(screen.getByTestId('cdss-visit-sections')).not.toHaveAttribute('data-folded')
    expect(screen.queryByTestId('cdss-visit-map-fold')).toBeNull()
  })
})
