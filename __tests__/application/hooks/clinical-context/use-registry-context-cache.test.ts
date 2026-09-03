import { renderHook } from '@testing-library/react'
import { useRegistryContextCache } from '@/src/application/hooks/clinical-context/use-registry-context-cache'
import { dataCategoryRegistry } from '@/src/core/registry/data-category.registry'
import { ALL_DATA_FILTERS } from '@/src/shared/constants/data-selection.constants'
import { ensureCategoriesInitialized } from '@/src/core/categories/init'

describe('bounded registry context reuse', () => {
  beforeEach(() => ensureCategoriesInitialized())
  afterEach(() => jest.restoreAllMocks())

  it('reuses equal filters, but not changed filters, source snapshots, dates or locale', () => {
    const calculate = jest.spyOn(dataCategoryRegistry, 'getCategoryContext').mockImplementation((_id, data, filters) => ({ title: data.id, items: [filters.imagingReportTimeRange] }))
    const initial = { data: { id: 'patient-A' }, now: 1, locale: 'zh-TW' }
    const { result, rerender } = renderHook(({ data, now, locale }) => useRegistryContextCache(data, now, locale), { initialProps: initial })
    const original = result.current('imagingReports', ALL_DATA_FILTERS)
    expect(result.current('imagingReports', { ...ALL_DATA_FILTERS })).toBe(original)
    expect(calculate).toHaveBeenCalledTimes(1)
    result.current('imagingReports', { ...ALL_DATA_FILTERS, imagingReportTimeRange: '3m' })
    expect(calculate).toHaveBeenCalledTimes(2)
    rerender({ ...initial, data: { id: 'patient-B' } })
    expect(result.current('imagingReports', ALL_DATA_FILTERS)).toEqual({ title: 'patient-B', items: ['all'] })
    expect(calculate).toHaveBeenCalledTimes(3)
    rerender({ ...initial, now: 2 })
    result.current('imagingReports', ALL_DATA_FILTERS)
    expect(calculate).toHaveBeenCalledTimes(4)
    rerender({ ...initial, now: 2, locale: 'en' })
    result.current('imagingReports', ALL_DATA_FILTERS)
    expect(calculate).toHaveBeenCalledTimes(5)
  })

  it('bounds retained entries and invalidates a replaced formatter', () => {
    const calculate = jest.spyOn(dataCategoryRegistry, 'getCategoryContext').mockReturnValue(null)
    const { result } = renderHook(() => useRegistryContextCache({}, 1, 'en'))
    for (let i = 0; i < 11; i++) result.current('imagingReports', { ...ALL_DATA_FILTERS, labPanelIds: String(i) })
    result.current('imagingReports', { ...ALL_DATA_FILTERS, labPanelIds: '0' })
    expect(calculate).toHaveBeenCalledTimes(12)
    const category = dataCategoryRegistry.get('imagingReports')!
    const format = jest.spyOn(category, 'getContextSection').mockReturnValue(null)
    result.current('imagingReports', { ...ALL_DATA_FILTERS, labPanelIds: '0' })
    expect(calculate).toHaveBeenCalledTimes(13)
    format.mockRestore()
  })
})
