import { useInsightResponsesStore } from '@/features/clinical-insights/hooks/useInsightResponsesStore'

describe('custom summary batch publication', () => {
  beforeEach(() => {
    useInsightResponsesStore.setState({
      responses: {},
      panelStatus: {
        a: { isLoading: true, error: null },
        b: { isLoading: true, error: null },
      },
      ownerPatientId: 'patient-1',
    })
  })

  it('publishes every completed module and loading state in one store update', () => {
    const snapshots: Array<{ texts: string[]; loading: boolean[] }> = []
    const unsubscribe = useInsightResponsesStore.subscribe((state) => {
      snapshots.push({
        texts: [state.responses.a?.text ?? '', state.responses.b?.text ?? ''],
        loading: [state.panelStatus.a.isLoading, state.panelStatus.b.isLoading],
      })
    })

    useInsightResponsesStore.getState().completeBatch(
      ['a', 'b'],
      {
        a: { text: 'summary a', isEdited: false, metadata: null },
        b: { text: 'summary b', isEdited: false, metadata: null },
      },
      {},
    )
    unsubscribe()

    expect(snapshots).toEqual([
      {
        texts: ['summary a', 'summary b'],
        loading: [false, false],
      },
    ])
  })

  it('finishes the whole batch while keeping a failed module out of responses', () => {
    const failure = new Error('quota exceeded')
    useInsightResponsesStore.getState().completeBatch(
      ['a', 'b'],
      { a: { text: 'summary a', isEdited: false, metadata: null } },
      { b: failure },
    )

    const state = useInsightResponsesStore.getState()
    expect(state.responses.a?.text).toBe('summary a')
    expect(state.responses.b).toBeUndefined()
    expect(state.panelStatus.a).toEqual({ isLoading: false, error: null })
    expect(state.panelStatus.b).toEqual({ isLoading: false, error: failure })
  })
})
