// useNow is a shared day clock: clinical countdowns advance across a local-day
// boundary without rebuilding every mounted UI/AI consumer on same-day resume.
import { renderHook, act } from '@testing-library/react'
import { useNow } from '@/src/shared/hooks/use-now.hook'

describe('useNow', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-06-17T10:00:00'))
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    })
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('returns the current time on mount', () => {
    const { result } = renderHook(() => useNow())
    expect(result.current).toBe(Date.now())
  })

  it('does not refresh for focus and visibility events on the same day', () => {
    const { result } = renderHook(() => useNow())
    const initial = result.current

    act(() => {
      jest.setSystemTime(new Date('2026-06-17T15:00:00'))
      window.dispatchEvent(new Event('focus'))
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(result.current).toBe(initial)
  })

  it('refreshes once when the tab returns on a new local day', () => {
    const { result } = renderHook(() => useNow())
    const initial = result.current

    act(() => {
      jest.setSystemTime(new Date('2026-06-18T09:00:00'))
      window.dispatchEvent(new Event('focus'))
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(result.current).toBe(Date.now())
    expect(result.current).toBeGreaterThan(initial)
  })

  it('does not refresh on visibilitychange while hidden', () => {
    const { result } = renderHook(() => useNow())
    const initial = result.current

    act(() => {
      jest.setSystemTime(new Date('2026-06-18T09:00:00'))
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        configurable: true,
      })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(result.current).toBe(initial)
  })

  it('rolls over at the next local midnight', () => {
    jest.setSystemTime(new Date('2026-06-17T23:59:30'))
    const { result } = renderHook(() => useNow())
    const initial = result.current

    act(() => {
      // Cross midnight (30s here, plus the 1s scheduling guard).
      jest.advanceTimersByTime(40 * 1000)
    })

    expect(result.current).toBeGreaterThan(initial)
  })

  it('shares one browser listener set across all consumers', () => {
    const addWindowSpy = jest.spyOn(window, 'addEventListener')
    const addDocumentSpy = jest.spyOn(document, 'addEventListener')

    const first = renderHook(() => useNow())
    const second = renderHook(() => useNow())

    expect(addWindowSpy.mock.calls.filter(([type]) => type === 'focus')).toHaveLength(1)
    expect(addDocumentSpy.mock.calls.filter(([type]) => type === 'visibilitychange')).toHaveLength(1)

    first.unmount()
    second.unmount()
    addWindowSpy.mockRestore()
    addDocumentSpy.mockRestore()
  })

  it('removes shared listeners after the last consumer unmounts', () => {
    const removeWindowSpy = jest.spyOn(window, 'removeEventListener')
    const removeDocumentSpy = jest.spyOn(document, 'removeEventListener')
    const first = renderHook(() => useNow())
    const second = renderHook(() => useNow())

    first.unmount()
    expect(removeWindowSpy).not.toHaveBeenCalledWith('focus', expect.any(Function))

    second.unmount()
    expect(removeWindowSpy).toHaveBeenCalledWith('focus', expect.any(Function))
    expect(removeDocumentSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    removeWindowSpy.mockRestore()
    removeDocumentSpy.mockRestore()
  })
})
