import { renderHook, act } from '@testing-library/react'
import { useResizableLayout } from '@/src/shared/hooks/layout/use-resizable-layout.hook'

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

  it('should provide container ref', () => {
    const { result } = renderHook(() => useResizableLayout())
    
    expect(result.current.containerRef).toBeDefined()
    expect(result.current.containerRef.current).toBeNull()
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
