/**
 * @jest-environment jsdom
 */

import {
  GUEST_BETA_FEATURES_KEY,
  isBetaFeaturesEnabledInBrowser,
  resolveBetaFeaturesKey,
  useBetaFeaturesStore,
} from '@/src/application/stores/beta-features.store'

describe('Beta feature preferences', () => {
  beforeEach(() => {
    localStorage.clear()
    useBetaFeaturesStore.setState({ enabledByUser: {} })
  })

  it('starts disabled and persists an explicit opt-in for one account', () => {
    expect(useBetaFeaturesStore.getState().enabledByUser['user-a']).toBeUndefined()

    useBetaFeaturesStore.getState().setBetaFeaturesEnabled('user-a', true)

    expect(useBetaFeaturesStore.getState().enabledByUser['user-a']).toBe(true)
    expect(useBetaFeaturesStore.getState().enabledByUser['user-b']).toBeUndefined()
    expect(JSON.parse(localStorage.getItem('mediprisma-beta-features') ?? '{}'))
      .toMatchObject({ state: { enabledByUser: { 'user-a': true } } })
  })

  it('keys a signed-out visitor by the anonymous session, and by a fixed key without one', () => {
    // A not-signed-in visitor must still be able to turn Beta on and have it
    // stick, so there is always a key: the anonymous Firebase uid when the free
    // tier minted one, and a single stable guest key when it did not.
    expect(resolveBetaFeaturesKey('account-uid', 'anon-uid')).toBe('account-uid')
    expect(resolveBetaFeaturesKey(undefined, 'anon-uid')).toBe('anon-uid')
    expect(resolveBetaFeaturesKey(null, null)).toBe(GUEST_BETA_FEATURES_KEY)
    expect(resolveBetaFeaturesKey()).toBe('guest')
  })

  it('persists the switch for a guest browser with no Firebase session at all', () => {
    useBetaFeaturesStore.getState().setBetaFeaturesEnabled(GUEST_BETA_FEATURES_KEY, true)

    expect(useBetaFeaturesStore.getState().enabledByUser[GUEST_BETA_FEATURES_KEY]).toBe(true)
    expect(isBetaFeaturesEnabledInBrowser()).toBe(true)
    expect(JSON.parse(localStorage.getItem('mediprisma-beta-features') ?? '{}'))
      .toMatchObject({ state: { enabledByUser: { guest: true } } })

    useBetaFeaturesStore.getState().setBetaFeaturesEnabled(GUEST_BETA_FEATURES_KEY, false)
    expect(isBetaFeaturesEnabledInBrowser()).toBe(false)
  })

  it('reads the browser answer from an anonymous session key too', () => {
    expect(isBetaFeaturesEnabledInBrowser()).toBe(false)

    useBetaFeaturesStore.getState().setBetaFeaturesEnabled('anon-abc123', true)

    expect(isBetaFeaturesEnabledInBrowser()).toBe(true)
  })
})
