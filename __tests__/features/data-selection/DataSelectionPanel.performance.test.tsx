import { render, screen } from '@testing-library/react'
import { DataSelectionPanel } from '@/features/data-selection/components/DataSelectionPanel'
import { LocalBundleService } from '@/src/infrastructure/fhir/services/local-bundle.service'
import { ALL_DATA_FILTERS, ALL_DATA_SELECTION } from '@/src/shared/constants/data-selection.constants'
import { ensureCategoriesInitialized } from '@/src/core/categories/init'
import { dataCategoryRegistry } from '@/src/core/registry/data-category.registry'
import { zhTW } from '@/src/shared/i18n/locales/zh-TW'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildCloudOncologyBundle } = require('../../../scripts/generate-cloud-oncology-stress-bundle.cjs')
let mockData: any
let mockPatient: any
const mockProfile = { selection: ALL_DATA_SELECTION, filters: ALL_DATA_FILTERS, documentMode: 'all', documentIds: [] }
jest.mock('@/src/application/hooks/patient/use-patient-query.hook', () => ({ usePatient: () => ({ patient: mockPatient }) }))
jest.mock('@/src/application/hooks/clinical-data/use-clinical-data-query.hook', () => ({ useClinicalData: () => mockData }))
jest.mock('@/src/application/providers/language.provider', () => ({ useLanguage: () => ({ locale: 'zh-TW', t: zhTW }) }))
jest.mock('@/src/application/providers/audience.provider', () => ({ useAudience: () => ({ audience: 'medical' }) }))
jest.mock('@/src/shared/hooks/use-now.hook', () => ({ useNow: () => Date.parse('2026-09-03') }))
jest.mock('@/features/data-selection/hooks/useResolvedDataSelectionModel', () => ({ useResolvedDataSelectionModel: () => ({ modelId: 'tvghbrain3.5', contextLimit: 154_000, modelLabel: 'tvghbrain3.5' }) }))
jest.mock('@/src/application/providers/data-selection.provider', () => ({ useDataSelection: () => ({
  getProfile: () => mockProfile, documentMode: 'all', documentIds: [], activePreset: 'newPatient',
}) }))

describe('large-chart data selection mounting', () => {
  beforeAll(() => {
    const parsed = LocalBundleService.parse(buildCloudOncologyBundle().bundle)
    if (!parsed) throw new Error('Invalid synthetic fixture')
    mockData = { ...parsed.collection, isLoading: false, isFetching: false, error: null }
    mockPatient = parsed.patient
    ensureCategoriesInitialized()
  })

  it('renders a fitted scope for the million-token cloud chart', () => {
    const registry = jest.spyOn(dataCategoryRegistry, 'getCategoryContext')
    const started = performance.now()
    const { unmount } = render(<DataSelectionPanel clinicalData={mockData} selectedData={ALL_DATA_SELECTION} filters={ALL_DATA_FILTERS} onSelectionChange={jest.fn()} onFiltersChange={jest.fn()} />)
    const elapsed = Math.round(performance.now() - started)
    expect(screen.getByRole('switch', { name: '文件', exact: true })).toBeChecked()
    expect(screen.getByTestId('model-fitted-scope')).toBeInTheDocument()
    // full → trimmed → compact, exactly once each for the shared view.
    expect(registry.mock.calls.filter(([key]) => key === 'imagingReports')).toHaveLength(3)
    if (process.env.CLINICAL_INPUT_BENCHMARK === '1') console.info('Synthetic panel mount', { elapsedMs: elapsed, imagingBuilds: registry.mock.calls.filter(([key]) => key === 'imagingReports').length })
    unmount()
    registry.mockRestore()
  }, 30_000)
})
