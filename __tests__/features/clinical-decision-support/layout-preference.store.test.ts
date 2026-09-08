/**
 * @jest-environment jsdom
 */
import { CDSS_LAYOUT_STORAGE_KEY, useCdssLayoutStore } from '@/features/clinical-decision-support/stores/layout-preference.store'

describe('guidance layout preference', () => {
  beforeEach(() => {
    localStorage.clear()
    useCdssLayoutStore.setState({ layout: 'board' })
  })

  it('opens on the board and remembers a switch to the classic table in this browser', () => {
    expect(useCdssLayoutStore.getState().layout).toBe('board')
    useCdssLayoutStore.getState().setLayout('classic')
    expect(useCdssLayoutStore.getState().layout).toBe('classic')
    expect(JSON.parse(localStorage.getItem(CDSS_LAYOUT_STORAGE_KEY) ?? '{}'))
      .toMatchObject({ state: { layout: 'classic' } })
  })
})
