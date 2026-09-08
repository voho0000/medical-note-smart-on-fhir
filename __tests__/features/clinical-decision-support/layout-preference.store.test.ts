/**
 * @jest-environment jsdom
 */
import { CDSS_LAYOUT_STORAGE_KEY, useCdssLayoutStore } from '@/features/clinical-decision-support/stores/layout-preference.store'

describe('guidance layout preference', () => {
  beforeEach(() => {
    localStorage.clear()
    useCdssLayoutStore.setState({ layout: 'c' })
  })

  it('opens on direction C and remembers a switch to the original board in this browser', () => {
    expect(useCdssLayoutStore.getState().layout).toBe('c')
    useCdssLayoutStore.getState().setLayout('board')
    expect(useCdssLayoutStore.getState().layout).toBe('board')
    expect(JSON.parse(localStorage.getItem(CDSS_LAYOUT_STORAGE_KEY) ?? '{}'))
      .toMatchObject({ state: { layout: 'board' } })
  })
})
