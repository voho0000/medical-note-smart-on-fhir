// useNow must refresh its value on the events that matter for day-granularity
// staleness (tab focus / visibility, and the local midnight rollover) so that
// derived "days remaining" countdowns don't freeze on a long-lived tab —
// while staying quiet otherwise (no per-second polling).
import { renderHook, act } from '@testing-library/react'
import { useNow } from '@/src/shared/hooks/use-now.hook'

describe('useNow', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-06-17T10:00:00'))
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it('returns the current time on mount', () => {
    const { result } = renderHook(() => useNow())
    expect(result.current).toBe(Date.now())
  })

  it('refreshes when the tab regains focus', () => {
    const { result } = renderHook(() => useNow())
    const initial = result.current

    act(() => {
      jest.setSystemTime(new Date('2026-06-17T15:00:00'))
      window.dispatchEvent(new Event('focus'))
    })

    expect(result.current).toBe(Date.now())
    expect(result.current).toBeGreaterThan(initial)
  })

  it('refreshes on visibilitychange when the document becomes visible', () => {
    const { result } = renderHook(() => useNow())
    const initial = result.current

    act(() => {
      jest.setSystemTime(new Date('2026-06-18T09:00:00'))
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      })
      document.dispatchEvent(new Event('visibilitychange'))
    })

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
      // Cross midnight (msUntilNextMidnight is 30s here, plus the +1s guard).
      jest.advanceTimersByTime(40 * 1000)
    })

    expect(result.current).toBeGreaterThan(initial)
  })

  it('removes its listeners on unmount', () => {
    const removeSpy = jest.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useNow())

    unmount()

    expect(removeSpy).toHaveBeenCalledWith('focus', expect.any(Function))
    removeSpy.mockRestore()
  })
})
