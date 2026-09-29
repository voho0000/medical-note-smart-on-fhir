/**
 * The decision map beside its details (clinician feedback 2026-09-29: 「左邊
 * 是一整排 DP，右邊是細項，細項不用太寬」). From 36rem the map is a column of
 * every point on the left and the open section is beside it; a press moves
 * the page only as far as it has to. The layout is container queries; what is
 * tested here is what the component does about it — a section stays open
 * beside the column, and nothing jumps to show what is already in view.
 */
import { useMemo } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
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
    // Beside the details a name shows its section and never folds it: the
    // one shown is current, not expanded.
    const status = screen.getByTestId('cdss-visit-section-toggle-status')
    expect(status).toHaveAttribute('aria-current', 'true')
    expect(status).not.toHaveAttribute('aria-expanded')
    fireEvent.click(status)
    expect(status).toHaveAttribute('aria-current', 'true')
    const outlook = screen.getByTestId('cdss-visit-section-toggle-outlook')
    fireEvent.click(outlook)
    fireEvent.click(outlook)
    expect(outlook).toHaveAttribute('aria-current', 'true')
    expect(status).not.toHaveAttribute('aria-current')
    expect(screen.getByTestId('cdss-visit-column-outlook')).toBeVisible()
    expect(screen.getByTestId('cdss-visit-column-status')).not.toBeVisible()
  })

  it('moves to the shown section when its name is pressed again, and leaves no move for later', () => {
    atWidth(700)
    const moved: string[] = []
    Element.prototype.scrollIntoView = function scrollIntoView(this: Element) { moved.push(this.id) }
    render(<Harness model={p4Model()} />)
    const status = screen.getByTestId('cdss-visit-section-toggle-status')
    fireEvent.click(status)
    moved.length = 0
    // Pressed again: nothing changes but the page, which comes back to 01.
    fireEvent.click(status)
    expect(moved).toEqual(['cdss-visit-column-status'])
    moved.length = 0
    // A later press elsewhere goes where it goes, never back to 01's top.
    const tile = screen.getByTestId('cdss-visit-overview-status').querySelector<HTMLButtonElement>('button[data-dp]')
    fireEvent.click(tile!)
    expect(moved).not.toContain('cdss-visit-column-status')
  })

  it('gives the column its measured height only as a column', () => {
    atWidth(700)
    render(<Harness model={p4Model()} />)
    const column = screen.getByTestId('cdss-visit-overview')
    expect(column.style.getPropertyValue('--cdss-column-height')).toMatch(/px$/)
    expect(column.style.maxHeight).toBe('')
    expect(column).toHaveClass('@min-[36rem]:max-h-(--cdss-column-height)')
  })

  it('stacks when the panel is narrowed, and stands beside again when widened', () => {
    let width = 700
    const observed: (() => void)[] = []
    Element.prototype.getBoundingClientRect = function rect(this: Element) {
      return this.getAttribute('data-testid') === 'cdss-visit-map' ? box(0, 800, width) : box(0, 0, 0)
    }
    window.ResizeObserver = class {
      constructor(callback: () => void) { observed.push(callback) }
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
    render(<Harness model={p4Model()} />)
    const map = screen.getByTestId('cdss-visit-map')
    expect(map).toHaveAttribute('data-layout', 'side-by-side')
    width = 500
    act(() => { for (const callback of observed) callback() })
    expect(map).toHaveAttribute('data-layout', 'overview')
    expect(screen.getByTestId('cdss-visit-overview').style.getPropertyValue('--cdss-column-height')).toBe('')
    width = 900
    act(() => { for (const callback of observed) callback() })
    expect(map).toHaveAttribute('data-layout', 'side-by-side')
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
  const innerHeight = window.innerHeight
  const made: Element[] = []
  function target(top: number, height: number, parent: Element = document.body): HTMLElement {
    const element = document.createElement('div')
    element.getBoundingClientRect = () => box(top, height)
    element.scrollIntoView = scroll
    parent.appendChild(element)
    made.push(element)
    return element
  }
  /** A panel that scrolls, at `top`, `height` tall, holding more than that. */
  function panel(top: number, height: number): HTMLElement {
    const element = target(top, height)
    element.style.overflowY = 'auto'
    Object.defineProperty(element, 'clientHeight', { value: height })
    Object.defineProperty(element, 'scrollHeight', { value: height * 3 })
    return element
  }

  beforeEach(() => {
    scroll.mockClear()
    window.innerHeight = 800
  })

  afterEach(() => {
    for (const element of made.splice(0)) element.remove()
    window.innerHeight = innerHeight
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

  it('measures against the panel that scrolls, not the window', () => {
    const side = panel(100, 400)
    // 50px into the panel: in view.
    revealTop(target(150, 100, side))
    expect(scroll).not.toHaveBeenCalled()
    // In the window's upper part, but 350px into a 400px panel: not.
    revealTop(target(450, 100, side))
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest' })
  })

  it('passes over a layout that could scroll but holds nothing more than itself', () => {
    const layout = target(0, 2000)
    layout.style.overflowY = 'auto'
    Object.defineProperty(layout, 'clientHeight', { value: 2000 })
    Object.defineProperty(layout, 'scrollHeight', { value: 2000 })
    const side = panel(100, 400)
    layout.appendChild(side)
    revealTop(target(450, 100, side))
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest' })
  })

  it('does not count a top hidden under what is stuck above it as in view', () => {
    const element = target(30, 200)
    element.style.scrollMarginTop = '60px'
    revealTop(element)
    expect(scroll).toHaveBeenCalledWith({ block: 'start' })
  })
})
