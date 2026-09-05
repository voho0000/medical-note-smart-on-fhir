/**
 * The Beta switch answers one question for three surfaces (the right-panel tab
 * gate, the Settings switch, the guided tour), and this is where the two rules
 * that shape that answer are pinned down:
 *
 *   - no sign-in requirement — a visitor with no account gets a key and a
 *     working switch;
 *   - the unattended Medcloud hand-off is outside the Beta term entirely, so
 *     that route offers no switch and lights up no experimental tab, whatever
 *     this browser has stored.
 */
import { act, render, screen } from '@testing-library/react'
import { useBetaFeatures } from '@/src/application/hooks/use-beta-features.hook'
import {
  GUEST_BETA_FEATURES_KEY,
  useBetaFeaturesStore,
} from '@/src/application/stores/beta-features.store'

let mockAuth: { user: { uid: string } | null; anonymousUid: string | null } = {
  user: null,
  anonymousUid: null,
}
let mockMedcloudLaunchRoute = false

jest.mock('@/src/application/providers/auth.provider', () => ({
  useAuth: () => mockAuth,
}))

jest.mock('@/src/application/launch/medcloud-launch-route', () => ({
  isMedcloudLaunchRoute: () => mockMedcloudLaunchRoute,
}))

function Probe() {
  const { enabled, offered, storageKey, setEnabled } = useBetaFeatures()
  return (
    <div>
      <span data-testid="enabled">{String(enabled)}</span>
      <span data-testid="offered">{String(offered)}</span>
      <span data-testid="key">{storageKey}</span>
      <button type="button" onClick={() => setEnabled(true)}>turn on</button>
    </div>
  )
}

function read(testId: string): string {
  return screen.getByTestId(testId).textContent ?? ''
}

describe('useBetaFeatures', () => {
  beforeEach(() => {
    mockAuth = { user: null, anonymousUid: null }
    mockMedcloudLaunchRoute = false
    window.localStorage.clear()
    useBetaFeaturesStore.setState({ enabledByUser: {} })
  })

  it('lets a signed-out visitor with no session turn Beta on under the guest key', () => {
    render(<Probe />)

    expect(read('offered')).toBe('true')
    expect(read('key')).toBe(GUEST_BETA_FEATURES_KEY)
    expect(read('enabled')).toBe('false')

    act(() => {
      screen.getByRole('button', { name: 'turn on' }).click()
    })

    expect(useBetaFeaturesStore.getState().enabledByUser[GUEST_BETA_FEATURES_KEY]).toBe(true)
    expect(read('enabled')).toBe('true')
  })

  it('prefers the anonymous session uid, then the signed-in account uid', () => {
    mockAuth = { user: null, anonymousUid: 'anon-9' }
    const anonymous = render(<Probe />)
    expect(read('key')).toBe('anon-9')
    anonymous.unmount()

    mockAuth = { user: { uid: 'account-1' }, anonymousUid: null }
    render(<Probe />)
    expect(read('key')).toBe('account-1')
  })

  it('reads back an opt-in stored under the anonymous uid', () => {
    mockAuth = { user: null, anonymousUid: 'anon-9' }
    useBetaFeaturesStore.getState().setBetaFeaturesEnabled('anon-9', true)

    render(<Probe />)

    expect(read('enabled')).toBe('true')
  })

  it('offers nothing on the unattended Medcloud launch route', () => {
    // 北榮 hand-off: no opt-in question, and no Beta tab either — even though
    // this same browser turned the switch on outside that route.
    mockMedcloudLaunchRoute = true
    useBetaFeaturesStore.getState().setBetaFeaturesEnabled(GUEST_BETA_FEATURES_KEY, true)

    render(<Probe />)

    expect(read('offered')).toBe('false')
    expect(read('enabled')).toBe('false')
  })
})
