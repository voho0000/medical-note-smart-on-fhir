import { useNhiLipidReviewStore } from '@/features/clinical-decision-support/stores/nhi-lipid-review.store'

test('isolates patients, drops prior answers on patient switch and rejects stale events', () => {
  const store = useNhiLipidReviewStore
  store.getState().activate('synthetic-a')
  store.getState().answer('synthetic-a', 'smoking', 'yes')
  expect(store.getState().answers.smoking).toBe('yes')
  expect(store.getState().provenance.smoking).toEqual({ source: 'manual' })
  store.getState().activate('synthetic-b')
  expect(store.getState().answers).toEqual({})
  expect(store.getState().provenance).toEqual({})
  store.getState().answer('synthetic-a', 'smoking', 'no')
  expect(store.getState().answers).toEqual({})
  store.getState().activate('synthetic-a')
  expect(store.getState().answers).toEqual({})
})

test('unknown is an explicit answer; restoring automatic assessment removes only that override', () => {
  const store = useNhiLipidReviewStore
  store.getState().activate('synthetic-reset')
  store.getState().answer('synthetic-reset', 'hypertension', 'unknown')
  store.getState().answer('synthetic-reset', 'smoking', 'no')
  expect(store.getState().answers.hypertension).toBe('unknown')
  store.getState().answer('synthetic-reset', 'hypertension', undefined)
  expect(store.getState().answers).toEqual({ smoking: 'no' })
  expect(store.getState().provenance).toEqual({ smoking: { source: 'manual' } })
})

test('retains whether an answer came from AI or a clinician without changing the pack answer shape', () => {
  const store = useNhiLipidReviewStore
  store.getState().activate('synthetic-provenance')
  store.getState().answer('synthetic-provenance', 'smoking', 'yes', {
    source: 'ai',
    modelId: 'gpt-test',
    confidence: 'high',
  })
  expect(store.getState().answers).toEqual({ smoking: 'yes' })
  expect(store.getState().provenance.smoking).toEqual({
    source: 'ai',
    modelId: 'gpt-test',
    confidence: 'high',
  })

  store.getState().answer('synthetic-provenance', 'smoking', 'no')
  expect(store.getState().answers).toEqual({ smoking: 'no' })
  expect(store.getState().provenance.smoking).toEqual({ source: 'manual' })
})
