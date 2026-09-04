// Guided-tour analytics — drives the REAL tour stores and asserts what reaches
// the sink. Co-located with the other telemetry suites.
import { render } from '@testing-library/react'
import { act } from 'react'

jest.mock('@/src/shared/config/firebase.config', () => ({ app: undefined }))

jest.mock('@/src/application/telemetry/usage-analytics', () => {
  const actual = jest.requireActual('@/src/application/telemetry/usage-analytics')
  return { ...actual, trackEvent: jest.fn() }
})

import { trackEvent } from '@/src/application/telemetry/usage-analytics'
import { useTourAnalytics } from '@/src/shared/config/tour-analytics'
import { useLeftBrowserTourStore } from '@/features/left-browser-tour/left-browser-tour.store'
import { useRightFeatureTourStore } from '@/features/right-feature-tour/right-feature-tour.store'

const mockedTrackEvent = trackEvent as jest.MockedFunction<typeof trackEvent>

function Host() {
  useTourAnalytics()
  return null
}

describe('useTourAnalytics', () => {
  beforeEach(() => {
    mockedTrackEvent.mockClear()
    act(() => {
      useLeftBrowserTourStore.setState({ active: false, stepId: null, session: 0 })
      useRightFeatureTourStore.setState({
        active: false,
        stepId: null,
        session: 0,
      })
    })
  })

  it('reports the left tour starting', () => {
    render(<Host />)
    act(() => useLeftBrowserTourStore.getState().start())
    expect(mockedTrackEvent).toHaveBeenCalledTimes(1)
    expect(mockedTrackEvent).toHaveBeenCalledWith('tour_start', { tour: 'left' })
  })

  it('reports "finish" when the left tour is closed on the last step', () => {
    render(<Host />)
    act(() => useLeftBrowserTourStore.getState().start())
    act(() => useLeftBrowserTourStore.getState().setStep('finish'))
    mockedTrackEvent.mockClear()

    act(() => useLeftBrowserTourStore.getState().stop())

    expect(mockedTrackEvent).toHaveBeenCalledTimes(1)
    expect(mockedTrackEvent).toHaveBeenCalledWith('tour_end', {
      tour: 'left',
      tour_outcome: 'finish',
      step: 'finish',
    })
  })

  it('reports "abandon" with the step the user gave up on', () => {
    render(<Host />)
    act(() => useLeftBrowserTourStore.getState().start())
    act(() => useLeftBrowserTourStore.getState().setStep('medication-timeline'))
    mockedTrackEvent.mockClear()

    act(() => useLeftBrowserTourStore.getState().stop())

    expect(mockedTrackEvent).toHaveBeenCalledWith('tour_end', {
      tour: 'left',
      tour_outcome: 'abandon',
      step: 'medication-timeline',
    })
  })

  it('reports the right tour starting and ending', () => {
    render(<Host />)
    act(() => useRightFeatureTourStore.getState().start())
    expect(mockedTrackEvent).toHaveBeenCalledWith('tour_start', { tour: 'right' })
    act(() => useRightFeatureTourStore.getState().setStep('finish'))
    act(() => useRightFeatureTourStore.getState().stop())
    expect(mockedTrackEvent).toHaveBeenCalledWith('tour_end', {
      tour: 'right',
      tour_outcome: 'finish',
      step: 'finish',
    })
  })

  it('stops reporting once unmounted', () => {
    const { unmount } = render(<Host />)
    unmount()

    act(() => useLeftBrowserTourStore.getState().start())
    act(() => useLeftBrowserTourStore.getState().stop())
    act(() => useRightFeatureTourStore.getState().start())

    expect(mockedTrackEvent).not.toHaveBeenCalled()
  })
})
