import { initializeCategories } from '@/src/core/categories'
import { dataCategoryRegistry } from '@/src/core/registry/data-category.registry'

describe('data category registry', () => {
  it('does not expose legacy Other Observations as a user-facing category', () => {
    initializeCategories()
    expect(dataCategoryRegistry.get('observations')).toBeUndefined()
    expect(dataCategoryRegistry.getAllIds()).not.toContain('observations')
    expect(dataCategoryRegistry.get('labReports')).toBeDefined()
  })
})
