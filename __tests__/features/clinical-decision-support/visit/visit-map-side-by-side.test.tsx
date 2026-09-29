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
import { focusBackTo, focusInto, revealTop } from '@/features/clinical-decision-support/renderers/visit/reveal'
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

describe('where focus goes when what had it is folded away', () => {
  const made: HTMLElement[] = []
  /** An element that is laid out (`on`) or inside something folded away. */
  function el(html: string, on: boolean): HTMLElement {
    const holder = document.createElement('div')
    holder.innerHTML = html
    const element = holder.firstElementChild as HTMLElement
    element.getClientRects = () => (on ? [box(0, 20)] : []) as unknown as DOMRectList
    element.scrollIntoView = jest.fn()
    document.body.appendChild(element)
    made.push(element)
    return element
  }
  afterEach(() => { for (const element of made.splice(0)) element.remove() })

  const point = { dp: 'DP-12', source: 'hf' }
  const map = () => el('<section data-testid="cdss-visit-map"></section>', true)
  function tile(on: boolean): HTMLElement {
    const section = map()
    const button = el('<button data-dp="DP-12" data-source="hf">DP-12</button>', on)
    section.appendChild(button)
    return button
  }

  it('goes back to the point’s tile while it is on the page', () => {
    const shownTile = tile(true)
    el('<button data-testid="cdss-visit-map-fold">展開</button>', true)
    focusBackTo(point)
    expect(document.activeElement).toBe(shownTile)
  })

  it('goes to the point’s row in its section when the list is folded, else to 「展開」, else the step', () => {
    tile(false)
    const row = el('<button data-still-open="DP-12" data-source="hf">DP-12</button>', true)
    const fold = el('<button data-testid="cdss-visit-map-fold">展開</button>', true)
    focusBackTo(point)
    expect(document.activeElement).toBe(row)
    row.getClientRects = () => [] as unknown as DOMRectList
    focusBackTo(point)
    expect(document.activeElement).toBe(fold)
    fold.getClientRects = () => [] as unknown as DOMRectList
    const steps = el('<nav data-testid="cdss-visit-steps"><button aria-current="step">01</button></nav>', true)
    const current = steps.querySelector('button')!
    current.getClientRects = () => [box(0, 20)] as unknown as DOMRectList
    focusBackTo(point)
    expect(document.activeElement).toBe(current)
  })

  it('takes focus into a question: its first control on the page, else the question itself', () => {
    const question = el('<div data-dp="DP-01"><input type="radio" /><button>HFrEF</button></div>', true)
    const [radio, button] = [question.querySelector('input')!, question.querySelector('button')!]
    radio.getClientRects = () => [] as unknown as DOMRectList
    button.getClientRects = () => [box(0, 20)] as unknown as DOMRectList
    expect(focusInto(question)).toBe(true)
    expect(document.activeElement).toBe(button)
    const bare = el('<div data-dp="DP-01">紀錄：HFrEF</div>', true)
    expect(focusInto(bare)).toBe(true)
    expect(bare).toHaveAttribute('tabindex', '-1')
    expect(focusInto(el('<div>folded</div>', false))).toBe(false)
  })
})
