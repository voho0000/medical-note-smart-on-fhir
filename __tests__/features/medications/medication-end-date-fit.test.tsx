import { act, cleanup, render, screen } from '@testing-library/react'
import { useMedicationEndDateFit } from '@/features/clinical-summary/medications/hooks/useMedicationEndDateFit'

function Regimen({ enabled = true, frequency = 'QD' }) {
  const { regimenRef, compactEndDate } = useMedicationEndDateFit(enabled, frequency)
  return <div ref={regimenRef} data-testid="regimen">
    <span>26/09/03</span>
    <span data-testid="end" aria-hidden={compactEndDate}> → 26/10/01</span>
    <span>{frequency}</span>
  </div>
}

describe('medication end date fit', () => {
  let width: number
  let glyphSize: number
  let resize: ResizeObserverCallback
  let intersect: IntersectionObserverCallback
  let measure: jest.Mock
  let observeResize: jest.Mock
  let disconnectResize: jest.Mock
  const originalResize = global.ResizeObserver
  const originalIntersection = global.IntersectionObserver

  const flush = () => act(() => { jest.advanceTimersByTime(20) })
  const show = (elements = screen.getAllByTestId('regimen'), visible = true) => {
    act(() => intersect(elements.map(target => ({ target, isIntersecting: visible })) as IntersectionObserverEntry[], {} as IntersectionObserver))
    flush()
  }
  const changeWidth = (next: number) => {
    width = next
    act(() => resize(screen.getAllByTestId('regimen').map(target => ({ target })) as ResizeObserverEntry[], {} as ResizeObserver))
    flush()
  }

  beforeEach(() => {
    jest.useFakeTimers()
    width = 150
    glyphSize = 5
    measure = jest.fn((node: Node) => ({ width: (node.textContent?.length ?? 0) * glyphSize }))
    observeResize = jest.fn()
    disconnectResize = jest.fn()
    jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => width)
    jest.spyOn(document, 'createRange').mockImplementation(() => {
      let node: Node
      return {
        selectNodeContents: (value: Node) => { node = value },
        getBoundingClientRect: () => measure(node),
      } as Range
    })
    global.ResizeObserver = jest.fn().mockImplementation((callback: ResizeObserverCallback) => {
      resize = callback
      return { observe: observeResize, unobserve: jest.fn(), disconnect: disconnectResize }
    })
    global.IntersectionObserver = jest.fn().mockImplementation((callback: IntersectionObserverCallback) => {
      intersect = callback
      return { observe: jest.fn(), unobserve: jest.fn(), disconnect: jest.fn() }
    })
  })

  afterEach(() => {
    cleanup()
    jest.restoreAllMocks()
    jest.useRealTimers()
    global.ResizeObserver = originalResize
    global.IntersectionObserver = originalIntersection
  })

  it('compacts on narrowing and restores on widening without remeasuring glyphs', () => {
    render(<Regimen />)
    show()
    expect(screen.getByTestId('end')).toHaveAttribute('aria-hidden', 'false')
    const reads = measure.mock.calls.length
    expect(reads).toBeGreaterThan(0)
    changeWidth(80)
    expect(screen.getByTestId('end')).toHaveAttribute('aria-hidden', 'true')
    changeWidth(80)
    expect(screen.getByTestId('end')).toHaveAttribute('aria-hidden', 'true')
    changeWidth(150)
    expect(screen.getByTestId('end')).toHaveAttribute('aria-hidden', 'false')
    expect(measure).toHaveBeenCalledTimes(reads)
  })

  it('discards cached widths when regimen text changes', () => {
    const { rerender } = render(<Regimen />)
    show()
    rerender(<Regimen frequency="Every morning and evening after meals" />)
    show()
    expect(screen.getByTestId('end')).toHaveAttribute('aria-hidden', 'true')
  })

  it('remeasures when font size changes', () => {
    render(<Regimen />)
    show()
    glyphSize = 10
    screen.getByTestId('regimen').style.fontSize = '24px'
    changeWidth(150)
    expect(screen.getByTestId('end')).toHaveAttribute('aria-hidden', 'true')
  })

  it('invalidates cached glyphs after a font loads, including offscreen rows', () => {
    const originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts')
    const fonts = Object.assign(new EventTarget(), { ready: new Promise(() => {}) })
    Object.defineProperty(document, 'fonts', { configurable: true, value: fonts })
    try {
      const { unmount } = render(<Regimen />)
      show()
      show(undefined, false)
      glyphSize = 10
      const reads = measure.mock.calls.length
      act(() => { fonts.dispatchEvent(new Event('loadingdone')) })
      flush()
      expect(measure).toHaveBeenCalledTimes(reads)
      show()
      expect(screen.getByTestId('end')).toHaveAttribute('aria-hidden', 'true')
      unmount()
      act(() => { fonts.dispatchEvent(new Event('loadingdone')) })
      flush()
      expect(jest.getTimerCount()).toBe(0)
    } finally {
      if (originalFonts) Object.defineProperty(document, 'fonts', originalFonts)
      else Reflect.deleteProperty(document, 'fonts')
    }
  })

  it('uses shared observers for 1000 rows and only measures visible rows', () => {
    render(<>{Array.from({ length: 1000 }, (_, i) => <Regimen key={i} />)}</>)
    flush()
    expect(measure).not.toHaveBeenCalled()
    expect(global.ResizeObserver).toHaveBeenCalledTimes(1)
    expect(global.IntersectionObserver).toHaveBeenCalledTimes(1)
    const rows = screen.getAllByTestId('regimen')
    show(rows.slice(0, 5))
    expect(observeResize).toHaveBeenCalledTimes(5)
    const reads = measure.mock.calls.length
    show(rows.slice(0, 5), false)
    changeWidth(40)
    expect(measure).toHaveBeenCalledTimes(reads)
    show(rows.slice(5, 6))
    expect(screen.getAllByTestId('end')[5]).toHaveAttribute('aria-hidden', 'true')
    show(rows.slice(0, 1))
    expect(screen.getAllByTestId('end')[0]).toHaveAttribute('aria-hidden', 'true')
  })

  it('cancels queued work and releases observers on unmount', () => {
    const { unmount } = render(<Regimen />)
    act(() => intersect([{ target: screen.getByTestId('regimen'), isIntersecting: true }] as IntersectionObserverEntry[], {} as IntersectionObserver))
    unmount()
    flush()
    expect(measure).not.toHaveBeenCalled()
    expect(disconnectResize).toHaveBeenCalledTimes(1)
  })

  it('keeps required end dates even when narrow', () => {
    width = 40
    render(<Regimen enabled={false} />)
    flush()
    expect(screen.getByTestId('end')).toHaveAttribute('aria-hidden', 'false')
    expect(global.IntersectionObserver).not.toHaveBeenCalled()
  })

  it('still fits dates when IntersectionObserver is unavailable', () => {
    global.IntersectionObserver = undefined as unknown as typeof IntersectionObserver
    width = 40
    render(<Regimen />)
    flush()
    expect(screen.getByTestId('end')).toHaveAttribute('aria-hidden', 'true')
  })
})
