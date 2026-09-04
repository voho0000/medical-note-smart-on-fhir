// useTrackView — the `view_open` observer. The point of the effect (rather
// than a click handler) is that mounting on a layer's DEFAULT page counts as a
// view, so that case is asserted first.
import { render } from '@testing-library/react'

jest.mock('@/src/shared/config/firebase.config', () => ({ app: undefined }))

// Real markUserTrigger / consumeTrigger (that handshake is what is under test);
// only the sink is replaced.
jest.mock('@/src/infrastructure/telemetry/usage-analytics', () => {
  const actual = jest.requireActual('@/src/infrastructure/telemetry/usage-analytics')
  return { ...actual, trackEvent: jest.fn() }
})

import { markUserTrigger, trackEvent } from '@/src/infrastructure/telemetry/usage-analytics'
import { useTrackView } from '@/src/infrastructure/telemetry/use-track-view'

const mockedTrackEvent = trackEvent as jest.MockedFunction<typeof trackEvent>

function Probe({ id, active }: { id: string | null | undefined; active?: boolean }) {
  useTrackView('left', id, active)
  return null
}

/** Mirrors the real nesting: the child's effect commits before the parent's. */
function NestedProbe({ leftId, reportsId }: { leftId: string; reportsId: string }) {
  useTrackView('left', leftId)
  return <ReportsProbe id={reportsId} />
}

function ReportsProbe({ id }: { id: string }) {
  useTrackView('reports', id)
  return null
}

describe('useTrackView', () => {
  beforeEach(() => {
    mockedTrackEvent.mockClear()
  })

  it('reports the default page on mount with trigger "auto"', () => {
    render(<Probe id="patient" />)
    expect(mockedTrackEvent).toHaveBeenCalledTimes(1)
    expect(mockedTrackEvent).toHaveBeenCalledWith('view_open', {
      area: 'left',
      id: 'patient',
      trigger: 'auto',
    })
  })

  it('reports trigger "user" for the change a handler marked', () => {
    const { rerender } = render(<Probe id="patient" />)
    mockedTrackEvent.mockClear()

    markUserTrigger('left')
    rerender(<Probe id="reports" />)

    expect(mockedTrackEvent).toHaveBeenCalledTimes(1)
    expect(mockedTrackEvent).toHaveBeenCalledWith('view_open', {
      area: 'left',
      id: 'reports',
      trigger: 'user',
    })
  })

  it('falls back to "auto" for a programmatic change that follows', () => {
    const { rerender } = render(<Probe id="patient" />)
    markUserTrigger('left')
    rerender(<Probe id="reports" />)
    mockedTrackEvent.mockClear()

    rerender(<Probe id="meds" />)

    expect(mockedTrackEvent).toHaveBeenCalledWith('view_open', {
      area: 'left',
      id: 'meds',
      trigger: 'auto',
    })
  })

  it('gives the click to the marked area, not to the child that commits first', () => {
    markUserTrigger('left')
    render(<NestedProbe leftId="reports" reportsId="cumulative" />)

    const byArea = Object.fromEntries(
      mockedTrackEvent.mock.calls.map((call) => [
        (call[1] as { area: string }).area,
        (call[1] as { trigger: string }).trigger,
      ]),
    )
    expect(byArea).toEqual({ reports: 'auto', left: 'user' })
  })

  it('reports nothing while the id is null or empty', () => {
    const { rerender } = render(<Probe id={null} />)
    rerender(<Probe id={undefined} />)
    rerender(<Probe id="" />)
    expect(mockedTrackEvent).not.toHaveBeenCalled()
  })

  it('reports nothing while the layer is mounted but not on screen', () => {
    const { rerender } = render(<Probe id="patient" active={false} />)
    rerender(<Probe id="reports" active={false} />)
    expect(mockedTrackEvent).not.toHaveBeenCalled()
  })

  it('re-reports when a sticky-mounted layer becomes visible again', () => {
    const { rerender } = render(<Probe id="reports" active />)
    expect(mockedTrackEvent).toHaveBeenCalledTimes(1)

    rerender(<Probe id="reports" active={false} />)
    mockedTrackEvent.mockClear()

    // Same id, back on screen: the parent tab's click is the `user` event,
    // this re-exposure is a consequence of it.
    rerender(<Probe id="reports" active />)
    expect(mockedTrackEvent).toHaveBeenCalledTimes(1)
    expect(mockedTrackEvent).toHaveBeenCalledWith('view_open', {
      area: 'left',
      id: 'reports',
      trigger: 'auto',
    })
  })
})
