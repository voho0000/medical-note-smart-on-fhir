import { renderHook, act } from '@testing-library/react'
import { useExpandable } from '@/src/shared/hooks/ui/use-expandable.hook'

describe('useExpandable', () => {
  it('should initialize with default state (collapsed)', () => {
    const { result } = renderHook(() => useExpandable())
    
    expect(result.current.isExpanded).toBe(false)
  })

  it('should initialize with custom initial state', () => {
    const { result } = renderHook(() => useExpandable(true))
    
    expect(result.current.isExpanded).toBe(true)
  })

  it('should expand when expand is called', () => {
    const { result } = renderHook(() => useExpandable())
    
    act(() => {
      result.current.expand()
    })
    
    expect(result.current.isExpanded).toBe(true)
  })

  it('should collapse when collapse is called', () => {
    const { result } = renderHook(() => useExpandable(true))
    
    act(() => {
      result.current.collapse()
    })
    
    expect(result.current.isExpanded).toBe(false)
  })

  it('should toggle state', () => {
    const { result } = renderHook(() => useExpandable())
    
    act(() => {
      result.current.toggle()
    })
    expect(result.current.isExpanded).toBe(true)
    
    act(() => {
      result.current.toggle()
    })
    expect(result.current.isExpanded).toBe(false)
  })

  it('should allow direct state setting', () => {
    const { result } = renderHook(() => useExpandable())
    
    act(() => {
      result.current.setIsExpanded(true)
    })
    expect(result.current.isExpanded).toBe(true)
    
    act(() => {
      result.current.setIsExpanded(false)
    })
    expect(result.current.isExpanded).toBe(false)
  })

  it('should have stable function references', () => {
    const { result, rerender } = renderHook(() => useExpandable())
    
    const expand1 = result.current.expand
    const collapse1 = result.current.collapse
    const toggle1 = result.current.toggle
    
    rerender()
    
    expect(result.current.expand).toBe(expand1)
    expect(result.current.collapse).toBe(collapse1)
    expect(result.current.toggle).toBe(toggle1)
  })
})
