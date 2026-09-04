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
    expect(screen.getByRole('switch', { name: /^文件$/ })).toBeChecked()
    const fitted = screen.getByTestId('model-fitted-scope')
    // The chosen rung is the record-level `prioritized` one, filling the 100K
    // VGHBrain clinical budget. It used to be `trimmed` at ~13K: the
    // prioritizer budgets records through a dataset-wide estimate ratio, so its
    // RENDERED size landed just past the target and best-fit rejected it. The
    // hook now re-aims it at a budget scaled by the observed overshoot
    // (`nextPrioritizedContextBudget`), so this rung fits by construction.
    expect(fitted).toHaveTextContent('逐筆保留活動中問題')
    expect(fitted.textContent ?? '').toMatch(/本次實際送出約 (7\d|8\d|9\d|100)k tokens/)
    // full → trimmed (the first date-window rung that fits) → prioritized
    // (never comparable, so always measured) → one prioritized convergence
    // pass, for the shared view; the chosen rung is then served from the hook's
    // context cache. The narrower date-window rungs below the first fitting one
    // are skipped: they are nested inside it and cannot carry more. This used
    // to take five builds, reaching `compact` before anything fitted —
    // impression-first imaging reports (src/core/utils/imaging-impression.utils.ts)
    // make the wider `trimmed` rung fit, so two whole passes were saved; the
    // fourth build here is the single convergence pass that re-aims the
    // prioritizer after its first rendered candidate overshot 100K.
    expect(registry.mock.calls.filter(([key]) => key === 'imagingReports')).toHaveLength(4)
    if (process.env.CLINICAL_INPUT_BENCHMARK === '1') console.info('Synthetic panel mount', { elapsedMs: elapsed, imagingBuilds: registry.mock.calls.filter(([key]) => key === 'imagingReports').length })
    unmount()
    registry.mockRestore()
  }, 30_000)
})
