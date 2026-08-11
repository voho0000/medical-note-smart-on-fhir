import {
  mergeDisplayedFiltersChange,
  mergeDisplayedSelectionChange,
} from '@/features/data-selection/model-fitted-profile'
import {
  ALL_DATA_FILTERS,
  ALL_DATA_SELECTION,
} from '@/src/shared/constants/data-selection.constants'

describe('model-fitted Data Selection view', () => {
  it('persists only the selection field explicitly edited in the fitted view', () => {
    const saved = { ...ALL_DATA_SELECTION }
    const displayed = { ...saved, observations: false }
    const nextDisplayed = { ...displayed, medications: false }

    const nextSaved = mergeDisplayedSelectionChange(
      saved,
      displayed,
      nextDisplayed,
    )

    expect(nextSaved.medications).toBe(false)
    expect(nextSaved.observations).toBe(true)
  })

  it('does not persist the model caps on unrelated filters', () => {
    const saved = { ...ALL_DATA_FILTERS }
    const displayed = {
      ...saved,
      encounterTimeRange: '6m' as const,
      labDepth: '3' as const,
    }
    const nextDisplayed = {
      ...displayed,
      medicationChronic: 'chronic' as const,
    }

    const nextSaved = mergeDisplayedFiltersChange(
      saved,
      displayed,
      nextDisplayed,
    )

    expect(nextSaved.medicationChronic).toBe('chronic')
    expect(nextSaved.encounterTimeRange).toBe('all')
    expect(nextSaved.labDepth).toBe('all')
  })
})
