import { hasUnseenSummary, useSummaryActivityStore } from '@/src/application/stores/summary-activity.store'

describe('hasUnseenSummary', () => {
  it('says nothing before any run', () => {
    expect(hasUnseenSummary({ completedAt: null, acknowledgedAt: null })).toBe(false)
    expect(hasUnseenSummary({ completedAt: null, acknowledgedAt: 5 })).toBe(false)
  })

  it('announces a run the reader has never been shown', () => {
    expect(hasUnseenSummary({ completedAt: 10, acknowledgedAt: null })).toBe(true)
  })

  it('goes quiet once the panel has been opened after that run', () => {
    expect(hasUnseenSummary({ completedAt: 10, acknowledgedAt: 11 })).toBe(false)
  })

  it('announces again when a NEWER run finishes out of sight', () => {
    expect(hasUnseenSummary({ completedAt: 20, acknowledgedAt: 11 })).toBe(true)
  })
})

describe('useSummaryActivityStore', () => {
  beforeEach(() => {
    useSummaryActivityStore.setState({
      isGenerating: false,
      startedAt: null,
      completedAt: null,
      acknowledgedAt: null,
    })
  })

  it('starts a clock on the transition into a run, and only then', () => {
    useSummaryActivityStore.getState().setGenerating(true)
    const first = useSummaryActivityStore.getState().startedAt
    expect(typeof first).toBe('number')
    useSummaryActivityStore.getState().setGenerating(true)
    expect(useSummaryActivityStore.getState().startedAt).toBe(first)
    useSummaryActivityStore.getState().setGenerating(false)
    expect(useSummaryActivityStore.getState().startedAt).toBeNull()
  })

  it('records a completion and clears the running flag', () => {
    useSummaryActivityStore.getState().setGenerating(true)
    expect(useSummaryActivityStore.getState().isGenerating).toBe(true)
    useSummaryActivityStore.getState().markCompleted()
    const state = useSummaryActivityStore.getState()
    expect(state.isGenerating).toBe(false)
    expect(typeof state.completedAt).toBe('number')
  })

  it('holds no summary content — only that one finished', () => {
    useSummaryActivityStore.getState().markCompleted()
    expect(Object.keys(useSummaryActivityStore.getState()).sort()).toEqual([
      'acknowledge', 'acknowledgedAt', 'completedAt', 'isGenerating',
      'markCompleted', 'setGenerating', 'startedAt',
    ])
  })
})
