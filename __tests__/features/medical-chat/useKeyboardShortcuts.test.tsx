import { renderHook } from '@testing-library/react'
import { useKeyboardShortcuts } from '@/features/medical-chat/hooks/useKeyboardShortcuts'

describe('useKeyboardShortcuts', () => {
  let onCollapse: jest.Mock

  beforeEach(() => {
    onCollapse = jest.fn()
    document.body.style.overflow = ''
  })

  afterEach(() => {
    document.body.style.overflow = ''
  })

  it('should set body overflow to hidden when expanded', () => {
    renderHook(() => useKeyboardShortcuts(true, onCollapse))
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('should not set body overflow when not expanded', () => {
    renderHook(() => useKeyboardShortcuts(false, onCollapse))
    expect(document.body.style.overflow).toBe('')
  })

  it('should call onCollapse when Escape is pressed', () => {
    renderHook(() => useKeyboardShortcuts(true, onCollapse))
    
    const event = new KeyboardEvent('keydown', { key: 'Escape' })
    document.dispatchEvent(event)
    
    expect(onCollapse).toHaveBeenCalledTimes(1)
  })

  it('should not call onCollapse when other keys are pressed', () => {
    renderHook(() => useKeyboardShortcuts(true, onCollapse))
    
    const event = new KeyboardEvent('keydown', { key: 'Enter' })
    document.dispatchEvent(event)
    
    expect(onCollapse).not.toHaveBeenCalled()
  })

  it('should not call onCollapse when Escape is pressed but not expanded', () => {
    renderHook(() => useKeyboardShortcuts(false, onCollapse))
    
    const event = new KeyboardEvent('keydown', { key: 'Escape' })
    document.dispatchEvent(event)
    
    expect(onCollapse).not.toHaveBeenCalled()
  })

  it('should cleanup on unmount', () => {
    const { unmount } = renderHook(() => useKeyboardShortcuts(true, onCollapse))
    
    unmount()
    
    expect(document.body.style.overflow).toBe('')
    
    const event = new KeyboardEvent('keydown', { key: 'Escape' })
    document.dispatchEvent(event)
    expect(onCollapse).not.toHaveBeenCalled()
  })
})
