// First-run onboarding gate: completes once, persists across reloads, and
// assumes "completed" when no flag is present only AFTER reading localStorage.
import { renderHook, act } from '@testing-library/react'
import { useOnboarding } from '@/src/application/hooks/onboarding/use-onboarding.hook'
import { ONBOARDING_STORAGE_KEY } from '@/src/shared/constants/onboarding.constants'

beforeEach(() => {
  localStorage.clear()
})

describe('useOnboarding', () => {
  it('reports not-completed for a fresh visitor (no flag)', () => {
    const { result } = renderHook(() => useOnboarding())
    // After the mount effect reads localStorage, a brand-new user is pending.
    expect(result.current.ready).toBe(true)
    expect(result.current.completed).toBe(false)
  })

  it('reports completed when the versioned flag is set', () => {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, '1')
    const { result } = renderHook(() => useOnboarding())
    expect(result.current.completed).toBe(true)
  })

  it('markComplete persists the flag and flips completed', () => {
    const { result } = renderHook(() => useOnboarding())
    expect(result.current.completed).toBe(false)

    act(() => result.current.markComplete())

    expect(result.current.completed).toBe(true)
    expect(localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBe('1')
  })

  it('stays completed on a subsequent mount (reload)', () => {
    const first = renderHook(() => useOnboarding())
    act(() => first.result.current.markComplete())

    const second = renderHook(() => useOnboarding())
    expect(second.result.current.completed).toBe(true)
  })
})
