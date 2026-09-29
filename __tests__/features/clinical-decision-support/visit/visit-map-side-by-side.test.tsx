/**
 * The decision map beside its details (clinician feedback 2026-09-29: 「左邊
 * 是一整排 DP，右邊是細項，細項不用太寬」). From 36rem the map is a column of
 * every point on the left and the open section is beside it; a press moves
 * the page only as far as it has to. The layout is container queries; what is
 * tested here is what the component does about it — a section stays open
 * beside the column, and nothing jumps to show what is already in view.
 */
import { useMemo } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { VisitDecisionScreen } from '@/features/clinical-decision-support/renderers/visit/VisitDecisionScreen'
import { revealTop } from '@/features/clinical-decision-support/renderers/visit/reveal'
import type { VisitDecisionModel } from '@/features/clinical-decision-support/types'
import {
  usePhysicianDecisions,
  usePhysicianDecisionsStore,
} from '@/features/clinical-decision-support/stores/physician-decisions.store'
import { useVisitAnswersStore } from '@/features/clinical-decision-support/stores/visit-answers.store'
import { p4Model } from './visit-model.fixtures'

const PATIENT = 'side-by-side-patient'

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

/** A box of the given size at `top`, as `getBoundingClientRect` gives it. */
function box(top: number, height: number, width = 600): DOMRect {
  return { top, bottom: top + height, height, left: 0, right: width, width, x: 0, y: top, toJSON: () => ({}) } as DOMRect
}

const originalRect = Element.prototype.getBoundingClientRect
const originalObserver = window.ResizeObserver

beforeEach(() => {
  localStorage.clear()
  usePhysicianDecisionsStore.setState({ byPatientId: {}, hydratedPatientIds: {} })
  useVisitAnswersStore.setState({ byPatientId: {}, hydratedPatientIds: {} })
  Element.prototype.scrollIntoView = jest.fn()
})

afterEach(() => {
  Element.prototype.getBoundingClientRect = originalRect
  window.ResizeObserver = originalObserver
})

describe('the map beside its details', () => {
  /** A map `width` pixels wide, measured as the browser would. */
  function atWidth(width: number) {
    Element.prototype.getBoundingClientRect = function rect(this: Element) {
      return this.getAttribute('data-testid') === 'cdss-visit-map' ? box(0, 800, width) : box(0, 0, 0)
    }
    window.ResizeObserver = class {
      private readonly callback: () => void
      constructor(callback: () => void) { this.callback = callback }
      observe() { this.callback() }
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
  }

  it('stands every point in a column beside the open section from 36rem', () => {
    atWidth(700)
    render(<Harness model={p4Model()} />)
    const map = screen.getByTestId('cdss-visit-map')
    expect(map).toHaveAttribute('data-layout', 'side-by-side')
    // Every point the pack lists is in the column; the details beside it are their own container.
    const column = screen.getByTestId('cdss-visit-overview')
    expect(column.querySelectorAll('button[data-dp]')).toHaveLength(p4Model().points.length)
    expect(screen.getByTestId('cdss-visit-working')).toHaveClass('@container')
    expect(screen.getByTestId('cdss-visit-column-status')).toBeVisible()
  })

  it('keeps a section open when its name is pressed again, so the details are never empty', () => {
    atWidth(700)
    render(<Harness model={p4Model()} />)
    const status = screen.getByTestId('cdss-visit-section-toggle-status')
    expect(status).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(status)
    expect(status).toHaveAttribute('aria-expanded', 'true')
    const outlook = screen.getByTestId('cdss-visit-section-toggle-outlook')
    fireEvent.click(outlook)
    fireEvent.click(outlook)
    expect(outlook).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('cdss-visit-column-outlook')).toBeVisible()
    expect(screen.getByTestId('cdss-visit-column-status')).not.toBeVisible()
  })

  it('stacks under 36rem, where a section’s name folds it closed as before', () => {
    atWidth(500)
    render(<Harness model={p4Model()} />)
    expect(screen.getByTestId('cdss-visit-map')).toHaveAttribute('data-layout', 'overview')
    const status = screen.getByTestId('cdss-visit-section-toggle-status')
    fireEvent.click(status)
    expect(status).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('moving the page only as far as it has to', () => {
  const scroll = jest.fn()
  function target(top: number, height: number): Element {
    const element = document.createElement('div')
    element.getBoundingClientRect = () => box(top, height)
    element.scrollIntoView = scroll
    document.body.appendChild(element)
    return element
  }

  beforeEach(() => {
    scroll.mockClear()
    window.innerHeight = 800
  })

  it('leaves what is already in the upper part of the view where it is', () => {
    revealTop(target(120, 300))
    expect(scroll).not.toHaveBeenCalled()
  })

  it('shows all of something lower down that fits, by as little as it takes', () => {
    revealTop(target(700, 300))
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest' })
  })

  it('brings the top to the top of what is above the view, or too tall to fit', () => {
    revealTop(target(-400, 300))
    expect(scroll).toHaveBeenLastCalledWith({ block: 'start' })
    revealTop(target(500, 1200))
    expect(scroll).toHaveBeenLastCalledWith({ block: 'start' })
  })
})
