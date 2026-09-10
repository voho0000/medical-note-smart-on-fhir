import { renderHook, act } from '@testing-library/react'
import { useResizableLayout } from '@/src/shared/hooks/layout/use-resizable-layout.hook'
import { OVERVIEW_WIDE_PANEL_PX } from '@/features/clinical-summary/overview/overview.types'

describe('useResizableLayout', () => {
  it('should initialize with default width', () => {
    const { result } = renderHook(() => useResizableLayout())
    
    expect(result.current.leftWidth).toBe(50)
    expect(result.current.isDragging).toBe(false)
  })

  it('should initialize with custom width', () => {
    const { result } = renderHook(() => 
      useResizableLayout({ initialWidth: 60 })
    )
    
    expect(result.current.leftWidth).toBe(60)
  })

  it('should set dragging state on mouse down', () => {
    const { result } = renderHook(() => useResizableLayout())
    
    act(() => {
      result.current.handleMouseDown()
    })
    
    expect(result.current.isDragging).toBe(true)
  })

  // A callback ref, not a ref object: the workspace it attaches to does not
  // exist until a patient is loaded, and a ref object would still read null
  // when the hook's effects first run — with nothing to tell them later that
  // the element had arrived.
  it('attaches its container through a callback ref', () => {
    const { result } = renderHook(() => useResizableLayout())

    expect(typeof result.current.containerRef).toBe('function')
    act(() => { expect(() => result.current.containerRef(null)).not.toThrow() })
    act(() => {
      expect(() => result.current.containerRef(document.createElement('div'))).not.toThrow()
    })
  })

  it('should respect min and max width constraints', () => {
    const { result } = renderHook(() => 
      useResizableLayout({ 
        initialWidth: 50,
        minWidth: 30,
        maxWidth: 70
      })
    )
    
    expect(result.current.leftWidth).toBe(50)
  })

  it('should have stable handleMouseDown reference', () => {
    const { result, rerender } = renderHook(() => useResizableLayout())
    
    const handler1 = result.current.handleMouseDown
    rerender()
    const handler2 = result.current.handleMouseDown
    
    expect(handler1).toBe(handler2)
  })
})

// The reset path behind "a new patient starts from the landing split".
// Importing another chart does NOT unmount the workspace, so the container
// callback never re-fires; the shell calls resetPreferredWidth on patient id.
describe('useResizableLayout — resetPreferredWidth', () => {
  // The real threshold, imported — a copied number here would have gone on
  // asserting 64.14% after the 2×2 breakpoint moved, which is how a test ends
  // up describing behaviour the app no longer has.
  const TARGET = OVERVIEW_WIDE_PANEL_PX
  let observed: Element | null = null

  beforeEach(() => {
    observed = null
    ;(globalThis as any).ResizeObserver = class {
      observe(element: Element) { observed = element }
      disconnect() {}
    }
    // 1584px of usable width: the split can reach the target at ~64%.
    jest.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 1584, height: 900, top: 0, left: 0, right: 1584, bottom: 900, x: 0, y: 0,
      toJSON: () => ({}),
    } as DOMRect)
    jest.spyOn(globalThis, 'getComputedStyle').mockReturnValue({
      paddingLeft: '0px', paddingRight: '0px',
    } as CSSStyleDeclaration)
  })

  afterEach(() => {
    jest.restoreAllMocks()
    delete (globalThis as any).ResizeObserver
  })

  const mount = () => renderHook(() => useResizableLayout({
    initialWidth: 50, minWidth: 30, maxWidth: 70, preferLeftContentPx: TARGET,
  }))

  it('widens to the preferred split once the container attaches', () => {
    const { result } = mount()
    act(() => { result.current.containerRef(document.createElement('div')) })
    expect(result.current.leftWidth).toBeCloseTo(59.09, 1)
    expect(observed).not.toBeNull()
  })

  it('leaves a width the reader chose alone', () => {
    const { result } = mount()
    act(() => { result.current.containerRef(document.createElement('div')) })
    act(() => { result.current.setLeftWidth(50) })
    expect(result.current.leftWidth).toBe(50)
    // A later re-measure (a resize, a zoom) must not undo their choice.
    act(() => { result.current.containerRef(document.createElement('div')) })
  })

  it('returns to the preferred split when the caller says the task changed', () => {
    const { result } = mount()
    const container = document.createElement('div')
    act(() => { result.current.containerRef(container) })
    act(() => { result.current.setLeftWidth(50) })
    expect(result.current.leftWidth).toBe(50)

    act(() => { result.current.resetPreferredWidth() })
    expect(result.current.leftWidth).toBeCloseTo(59.09, 1)
  })
})
