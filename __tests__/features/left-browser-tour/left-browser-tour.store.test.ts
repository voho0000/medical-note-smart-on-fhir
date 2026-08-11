import {
  LEFT_BROWSER_TOUR_STORAGE_KEY,
  hasSeenLeftBrowserTour,
  markLeftBrowserTourSeen,
  useLeftBrowserTourStore,
} from '@/features/left-browser-tour/left-browser-tour.store'

describe('left browser tour store', () => {
  beforeEach(() => {
    localStorage.clear()
    useLeftBrowserTourStore.setState({ active: false, stepId: null, session: 0 })
  })

  it('starts, advances, and stops a replayable session', () => {
    useLeftBrowserTourStore.getState().start()

    expect(useLeftBrowserTourStore.getState()).toMatchObject({
      active: true,
      stepId: 'overview',
      session: 1,
    })

    useLeftBrowserTourStore.getState().setStep('documents')
    expect(useLeftBrowserTourStore.getState().stepId).toBe('documents')

    useLeftBrowserTourStore.getState().stop()
    expect(useLeftBrowserTourStore.getState()).toMatchObject({
      active: false,
      stepId: null,
      session: 1,
    })

    useLeftBrowserTourStore.getState().start()
    expect(useLeftBrowserTourStore.getState().session).toBe(2)
  })

  it('persists that the automatic offer has been handled', () => {
    expect(hasSeenLeftBrowserTour()).toBe(false)

    markLeftBrowserTourSeen()

    expect(localStorage.getItem(LEFT_BROWSER_TOUR_STORAGE_KEY)).toBe('1')
    expect(hasSeenLeftBrowserTour()).toBe(true)
  })
})
