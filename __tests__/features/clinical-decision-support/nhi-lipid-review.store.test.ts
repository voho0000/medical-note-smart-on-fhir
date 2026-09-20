import { useNhiLipidReviewStore } from '@/features/clinical-decision-support/stores/nhi-lipid-review.store'

const aiSuggestion = (criterionId: string, state: 'yes' | 'no' | 'unknown') => ({
  criterionId,
  state,
  confidence: 'high' as const,
  missing: [],
  evidence: [],
  modelId: 'model-test',
  modelName: 'Model Test',
  generatedAt: '2026-09-20T10:00:00+08:00',
})

const run = (runId: string, inputSignature = 'input-1') => ({
  runId,
  inputSignature,
  sourceScopeSignature: 'scope-1',
  promptVersion: 'prompt-1',
  startedAt: '2026-09-20T10:00:00+08:00',
})

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

test('atomically replaces the AI layer while preserving clinician answers', () => {
  const store = useNhiLipidReviewStore
  store.getState().activate('synthetic-atomic')
  store.getState().beginAiRun('synthetic-atomic', run('run-1'))
  store.getState().completeAiRun(
    'synthetic-atomic',
    'run-1',
    [aiSuggestion('smoking', 'yes'), aiSuggestion('cad', 'yes')],
    { smoking: 'unknown', cad: 'unknown' },
    '2026-09-20T10:01:00+08:00',
  )
  store.getState().answer('synthetic-atomic', 'cad', 'no', { source: 'manual', overrides: 'ai' })

  store.getState().beginAiRun('synthetic-atomic', run('run-2', 'input-2'))
  store.getState().completeAiRun(
    'synthetic-atomic',
    'run-2',
    [aiSuggestion('smoking', 'unknown'), aiSuggestion('cad', 'yes')],
    { smoking: 'unknown', cad: 'unknown' },
    '2026-09-20T10:02:00+08:00',
  )

  expect(store.getState().answers).toEqual({ cad: 'no' })
  expect(store.getState().provenance.cad).toMatchObject({ source: 'manual', overrides: 'ai' })
  expect(store.getState().aiReview.suggestions.smoking.state).toBe('unknown')
})

test('keeps the last completed evidence after a failed rerun and clears it on patient change', () => {
  const store = useNhiLipidReviewStore
  store.getState().activate('synthetic-evidence')
  store.getState().beginAiRun('synthetic-evidence', run('run-ok'))
  store.getState().completeAiRun(
    'synthetic-evidence',
    'run-ok',
    [aiSuggestion('smoking', 'yes')],
    { smoking: 'unknown' },
    '2026-09-20T10:01:00+08:00',
  )
  store.getState().beginAiRun('synthetic-evidence', run('run-fail'))
  store.getState().failAiRun('synthetic-evidence', 'run-fail', 'network failed')

  expect(store.getState().answers.smoking).toBe('yes')
  expect(store.getState().aiReview.suggestions.smoking).toBeDefined()
  expect(store.getState().aiReview.error).toBe('network failed')

  store.getState().activate('another-patient')
  expect(store.getState().answers).toEqual({})
  expect(store.getState().aiReview.suggestions).toEqual({})
})

test('invalidates AI answers when the same patient source revision changes', () => {
  const store = useNhiLipidReviewStore
  store.getState().activate('synthetic-revision')
  store.getState().beginAiRun('synthetic-revision', run('run-old', 'input-old'))
  store.getState().completeAiRun(
    'synthetic-revision',
    'run-old',
    [aiSuggestion('smoking', 'yes')],
    { smoking: 'unknown' },
    '2026-09-20T10:01:00+08:00',
  )
  store.getState().answer('synthetic-revision', 'cad', 'no', { source: 'manual' })

  store.getState().invalidateAiReview('synthetic-revision', 'input-new', 'scope-new')

  expect(store.getState().answers).toEqual({ cad: 'no' })
  expect(store.getState().aiReview.suggestions).toEqual({})
})

test('treats an unmarked legacy answer as manual during AI replacement', () => {
  const store = useNhiLipidReviewStore
  store.getState().activate('synthetic-legacy')
  useNhiLipidReviewStore.setState({ answers: { smoking: 'no' }, provenance: {} })
  store.getState().beginAiRun('synthetic-legacy', run('run-legacy'))
  store.getState().completeAiRun(
    'synthetic-legacy',
    'run-legacy',
    [aiSuggestion('smoking', 'yes')],
    { smoking: 'unknown' },
    '2026-09-20T10:01:00+08:00',
  )

  expect(store.getState().answers.smoking).toBe('no')
  expect(store.getState().provenance.smoking).toBeUndefined()
})
