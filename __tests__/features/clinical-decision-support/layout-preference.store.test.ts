/**
 * @jest-environment jsdom
 */
import {
  CDSS_LAYOUT_STORAGE_KEY,
  CDSS_SWITCHABLE_LAYOUTS,
  LIPID_SWITCHABLE_LAYOUTS,
  useCdssLayoutStore,
} from '@/features/clinical-decision-support/stores/layout-preference.store'

describe('guidance layout preference', () => {
  beforeEach(() => {
    localStorage.clear()
    useCdssLayoutStore.setState({ layout: 'sections' })
  })

  it('opens on three sections and remembers a switch to the original board in this browser', () => {
    expect(useCdssLayoutStore.getState().layout).toBe('sections')
    useCdssLayoutStore.getState().setLayout('board')
    expect(useCdssLayoutStore.getState().layout).toBe('board')
    expect(JSON.parse(localStorage.getItem(CDSS_LAYOUT_STORAGE_KEY) ?? '{}'))
      .toMatchObject({ state: { layout: 'board' } })
  })

  it('offers three distinct layouts for each disease surface', () => {
    // `c` and `classic` stay in the type and in the view for what still reads
    // them; neither is a face a pilot user can be sent back to.
    expect(CDSS_SWITCHABLE_LAYOUTS).toEqual(['sections', 'flow', 'board'])
    expect(LIPID_SWITCHABLE_LAYOUTS).toEqual(['sections', 'nhi', 'board'])
  })

  it('reads a browser that stored the retired direction C as three sections', () => {
    localStorage.setItem(CDSS_LAYOUT_STORAGE_KEY, JSON.stringify({ state: { layout: 'c' }, version: 0 }))
    useCdssLayoutStore.persist.rehydrate()
    expect(useCdssLayoutStore.getState().layout).toBe('sections')
  })
})
