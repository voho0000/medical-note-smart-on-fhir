/**
 * @jest-environment jsdom
 */

import { useBetaFeaturesStore } from '@/src/application/stores/beta-features.store'

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
})
