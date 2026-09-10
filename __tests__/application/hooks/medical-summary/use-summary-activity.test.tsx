import { act, renderHook } from '@testing-library/react'
import { useSummaryActivity } from '@/src/application/hooks/medical-summary/use-summary-activity.hook'
import { useSummaryActivityStore } from '@/src/application/stores/summary-activity.store'

const initial = { busy: false, scope: 'patient-a', completedAt: 100, failed: false }
beforeEach(() => {
  act(() => useSummaryActivityStore.setState({ isGenerating: false, startedAt: null, completedAt: null, acknowledgedAt: null }))
})

it('announces a newly completed result', () => {
  const { rerender } = renderHook(useSummaryActivity, { initialProps: initial })
  rerender({ ...initial, busy: true })
  rerender({ ...initial, completedAt: 200 })
  expect(useSummaryActivityStore.getState().completedAt).not.toBeNull()
})

it.each(['cancelled', 'failed', 'scope changed'])('does not announce retained or unrelated results when %s', reason => {
  const { rerender } = renderHook(useSummaryActivity, { initialProps: initial })
  rerender({ ...initial, busy: true })
  rerender({ ...initial,
    failed: reason === 'failed',
    scope: reason === 'scope changed' ? 'patient-b' : initial.scope,
    completedAt: reason === 'scope changed' ? 200 : initial.completedAt,
  })
  expect(useSummaryActivityStore.getState().completedAt).toBeNull()
  expect(useSummaryActivityStore.getState().isGenerating).toBe(false)
})
