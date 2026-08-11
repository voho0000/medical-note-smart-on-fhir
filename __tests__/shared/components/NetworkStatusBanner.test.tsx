/**
 * @jest-environment jsdom
 */
import { act, render, screen } from '@testing-library/react'
import { NetworkStatusBanner } from '@/src/shared/components/NetworkStatusBanner'
import { useConnectivityStore } from '@/src/application/stores/connectivity.store'

jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({
    t: {
      connectivity: {
        offline: 'OFFLINE',
        cloudUnavailable: 'CLOUD_UNAVAILABLE',
        pendingSync: 'PENDING_SYNC',
        synced: 'SYNCED',
        syncError: 'SYNC_ERROR',
      },
    },
  }),
}))

describe('NetworkStatusBanner', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true })
    useConnectivityStore.setState({
      browserOnline: true,
      firestoreConnection: 'server',
      chatSyncStatus: 'idle',
    })
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('immediately warns when the browser goes offline', () => {
    render(<NetworkStatusBanner />)
    act(() => {
      Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false })
      window.dispatchEvent(new Event('offline'))
    })
    expect(screen.getByText('OFFLINE')).toBeInTheDocument()
  })

  it('reports Firestore cache fallback even if navigator still says online', () => {
    render(<NetworkStatusBanner />)
    act(() => useConnectivityStore.getState().setFirestoreConnection('cache'))
    expect(screen.getByText('CLOUD_UNAVAILABLE')).toBeInTheDocument()
  })

  it('does not flash pending sync for ordinary fast writes', () => {
    render(<NetworkStatusBanner />)
    act(() => useConnectivityStore.getState().setChatSyncStatus('pending'))
    expect(screen.queryByText('PENDING_SYNC')).not.toBeInTheDocument()
    act(() => jest.advanceTimersByTime(1500))
    expect(screen.getByText('PENDING_SYNC')).toBeInTheDocument()
  })
})
