import { renderHook, act } from '@testing-library/react'
import { useResponsiveView } from '@/src/shared/hooks/layout/use-responsive-view.hook'

describe('useResponsiveView', () => {
  const originalInnerWidth = window.innerWidth

  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: originalInnerWidth,
    })
  })

  it('should initialize with initial view', () => {
    const { result } = renderHook(() => useResponsiveView('left'))
    expect(result.current.mobileView).toBe('left')
  })

  it('should detect large screen', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1200,
    })

    const { result } = renderHook(() => useResponsiveView('left'))
    
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })

    expect(result.current.isLargeScreen).toBe(true)
  })

  it('should detect small screen', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 800,
    })

    const { result } = renderHook(() => useResponsiveView('left'))
    
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })

    expect(result.current.isLargeScreen).toBe(false)
  })

  it('should allow changing mobile view', () => {
    const { result } = renderHook(() => useResponsiveView<'left' | 'right'>('left'))
    
    act(() => {
      result.current.setMobileView('right')
    })

    expect(result.current.mobileView).toBe('right')
  })

  it('should use custom breakpoint', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 900,
    })

    const { result } = renderHook(() => useResponsiveView('left', 768))
    
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })

    expect(result.current.isLargeScreen).toBe(true)
  })
})
