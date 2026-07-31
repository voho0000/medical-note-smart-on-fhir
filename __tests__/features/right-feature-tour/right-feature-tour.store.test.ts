import {
  useRightFeatureTourStore,
} from '@/features/right-feature-tour/right-feature-tour.store'

describe('right feature tour store', () => {
  beforeEach(() => {
    useRightFeatureTourStore.setState({
      active: false,
      stepId: null,
      session: 0,
    })
  })

  it('starts a new tour session from the overview', () => {
    useRightFeatureTourStore.getState().start()

    expect(useRightFeatureTourStore.getState()).toMatchObject({
      active: true,
      stepId: 'overview',
      session: 1,
    })
  })

  it('updates the current step and stops cleanly', () => {
    useRightFeatureTourStore.getState().start()
    useRightFeatureTourStore.getState().setStep('calculator')
    expect(useRightFeatureTourStore.getState().stepId).toBe('calculator')

    useRightFeatureTourStore.getState().stop()
    expect(useRightFeatureTourStore.getState()).toMatchObject({
      active: false,
      stepId: null,
    })
  })
})
