// `source_nav` — whether a clinician follows an AI citation into the chart.
// The store is the single funnel every citation goes through, so the event
// lives there; the risk to guard is that it starts carrying more than the
// resource TYPE.
export {}

jest.mock('@/src/application/telemetry/usage-analytics', () => {
  const actual = jest.requireActual('@/src/application/telemetry/usage-analytics')
  return { ...actual, trackEvent: jest.fn() }
})

import { trackEvent } from '@/src/application/telemetry/usage-analytics'
import { useResourceNavigationStore } from '@/src/application/stores/resource-navigation.store'

const mockedTrackEvent = trackEvent as jest.MockedFunction<typeof trackEvent>

describe('source_nav', () => {
  beforeEach(() => {
    mockedTrackEvent.mockClear()
    useResourceNavigationStore.setState({ pending: null, seq: 0, consumedSeq: 0 })
  })

  it('reports the origin the caller declared', () => {
    useResourceNavigationStore.getState().navigate({
      resourceType: 'Observation',
      resourceId: 'obs-1',
      origin: 'summary',
    })

    expect(mockedTrackEvent).toHaveBeenCalledTimes(1)
    expect(mockedTrackEvent).toHaveBeenCalledWith('source_nav', {
      target_type: 'Observation',
      from: 'summary',
    })
  })

  it('reports a chart-internal jump as unknown', () => {
    useResourceNavigationStore.getState().navigate({
      resourceType: 'MedicationRequest',
      resourceId: 'med-1',
    })

    expect(mockedTrackEvent).toHaveBeenCalledWith('source_nav', {
      target_type: 'MedicationRequest',
      from: 'unknown',
    })
  })

  it('carries no identifier, label, date or quote', () => {
    useResourceNavigationStore.getState().navigate({
      resourceType: 'DiagnosticReport',
      resourceId: 'dr-42',
      display: '胸部X光',
      date: '2026-09-01',
      evidenceQuote: 'no acute cardiopulmonary process',
      origin: 'safety',
    })

    expect(mockedTrackEvent.mock.calls[0][1]).toEqual({
      target_type: 'DiagnosticReport',
      from: 'safety',
    })
  })

  it('still routes normally', () => {
    useResourceNavigationStore.getState().navigate({
      resourceType: 'Observation',
      resourceId: 'obs-1',
    })

    const state = useResourceNavigationStore.getState()
    expect(state.pending?.resourceId).toBe('obs-1')
    expect(state.seq).toBe(1)
  })
})
