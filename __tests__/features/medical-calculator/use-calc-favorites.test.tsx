import { renderHook, act, waitFor } from '@testing-library/react'
import { useCalcFavorites, useCalcRecent } from '@/features/medical-calculator/hooks/use-calc-favorites.hook'

beforeEach(() => {
  window.localStorage.clear()
})

describe('useCalcFavorites', () => {
  it('starts empty and toggles a calculator on/off', async () => {
    const { result } = renderHook(() => useCalcFavorites())
    await waitFor(() => expect(result.current.favorites).toEqual([]))

    act(() => result.current.toggleFavorite('bmi'))
    await waitFor(() => expect(result.current.isFavorite('bmi')).toBe(true))

    act(() => result.current.toggleFavorite('bmi'))
    await waitFor(() => expect(result.current.isFavorite('bmi')).toBe(false))
  })

  it('persists across hook instances (same localStorage key)', async () => {
    const first = renderHook(() => useCalcFavorites())
    await waitFor(() => expect(first.result.current.favorites).toEqual([]))
    act(() => first.result.current.toggleFavorite('meld-na'))

    const second = renderHook(() => useCalcFavorites())
    await waitFor(() => expect(second.result.current.isFavorite('meld-na')).toBe(true))
  })
})

describe('useCalcRecent', () => {
  it('records most-recently-used first, de-duplicating repeats', async () => {
    const { result } = renderHook(() => useCalcRecent())
    await waitFor(() => expect(result.current.recent).toEqual([]))

    act(() => result.current.markUsed('bmi'))
    act(() => result.current.markUsed('curb-65'))
    act(() => result.current.markUsed('bmi')) // re-open BMI — should move to front, not duplicate

    await waitFor(() => expect(result.current.recent).toEqual(['bmi', 'curb-65']))
  })

  it('caps the list at 8 entries', async () => {
    const { result } = renderHook(() => useCalcRecent())
    await waitFor(() => expect(result.current.recent).toEqual([]))

    act(() => {
      for (let i = 0; i < 12; i++) result.current.markUsed(`calc-${i}`)
    })

    await waitFor(() => expect(result.current.recent).toHaveLength(8))
    expect(result.current.recent[0]).toBe('calc-11') // most recent first
  })
})
