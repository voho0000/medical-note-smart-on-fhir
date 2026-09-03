import { fireEvent, render, screen } from '@testing-library/react'
import { DataSelectionPanel } from '@/features/data-selection/components/DataSelectionPanel'
import { LocalBundleService } from '@/src/infrastructure/fhir/services/local-bundle.service'
import { ALL_DATA_FILTERS, ALL_DATA_SELECTION } from '@/src/shared/constants/data-selection.constants'
import { ensureCategoriesInitialized } from '@/src/core/categories/init'
import { dataCategoryRegistry } from '@/src/core/registry/data-category.registry'
import { listClinicalDocuments } from '@/src/core/utils/clinical-documents.utils'
import { zhTW } from '@/src/shared/i18n/locales/zh-TW'
import type { ConsumerProfile } from '@/src/application/providers/data-selection.provider'

// Fully synthetic local reproduction; never calls an AI endpoint.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildCloudOncologyBundle } = require('../../../scripts/generate-cloud-oncology-stress-bundle.cjs')
let mockData: any
let mockPatient: any
let mockLimit = 154_000
let mockProfile: ConsumerProfile
jest.mock('@/src/application/hooks/patient/use-patient-query.hook', () => ({ usePatient: () => ({ patient: mockPatient }) }))
jest.mock('@/src/application/hooks/clinical-data/use-clinical-data-query.hook', () => ({ useClinicalData: () => mockData }))
jest.mock('@/src/application/providers/language.provider', () => ({ useLanguage: () => ({ locale: 'zh-TW', t: zhTW }) }))
jest.mock('@/src/application/providers/audience.provider', () => ({ useAudience: () => ({ audience: 'medical' }) }))
jest.mock('@/src/shared/hooks/use-now.hook', () => ({ useNow: () => Date.parse('2026-09-03') }))
jest.mock('@/features/data-selection/hooks/useResolvedDataSelectionModel', () => ({ useResolvedDataSelectionModel: () => ({ modelId: 'tvghbrain3.5', contextLimit: mockLimit, modelLabel: 'tvghbrain3.5' }) }))
jest.mock('@/src/application/providers/data-selection.provider', () => ({ useDataSelection: () => ({
  getProfile: () => mockProfile,
  documentMode: mockProfile.documentMode,
  documentIds: mockProfile.documentIds,
  activePreset: 'newPatient',
  setDocumentMode: (documentMode: ConsumerProfile['documentMode']) => { mockProfile = { ...mockProfile, documentMode } },
  setDocumentIds: (documentIds: string[]) => { mockProfile = { ...mockProfile, documentIds } },
}) }))

test('keeps saved document picks visible and reuses sections across model-capacity changes', () => {
  const parsed = LocalBundleService.parse(buildCloudOncologyBundle().bundle)
  if (!parsed) throw new Error('Invalid synthetic fixture')
  mockData = { ...parsed.collection, isLoading: false, isFetching: false, error: null }
  mockPatient = parsed.patient
  mockProfile = { selection: ALL_DATA_SELECTION, filters: ALL_DATA_FILTERS, documentMode: 'latestAdmission', documentIds: [] }
  ensureCategoriesInitialized()
  const registry = jest.spyOn(dataCategoryRegistry, 'getCategoryContext')
  const props = { clinicalData: mockData, selectedData: ALL_DATA_SELECTION, filters: ALL_DATA_FILTERS, onSelectionChange: jest.fn(), onFiltersChange: jest.fn() }
  const { rerender, unmount } = render(<DataSelectionPanel {...props} />)
  const docs = listClinicalDocuments(mockData)
  const extra = docs.filter(doc => doc.isDischargeSummary)[1]
  const index = docs.findIndex(doc => doc.id === extra.id)
  const checkboxes = screen.getAllByRole('checkbox')
  expect(checkboxes).toHaveLength(docs.length)
  expect(checkboxes[index]).not.toBeChecked()
  registry.mockClear()
  const clickStart = performance.now()
  fireEvent.click(checkboxes[index])
  rerender(<DataSelectionPanel {...props} />)
  const documentMs = Math.round(performance.now() - clickStart)
  expect(mockProfile.documentMode).toBe('custom')
  expect(mockProfile.documentIds).toContain(extra.id)
  expect(screen.getAllByRole('checkbox')[index]).toBeChecked()
  expect(screen.getAllByRole('checkbox')[index].closest('label')).not.toHaveTextContent('未納入本次模型範圍')
  const documentBuilds = registry.mock.calls.filter(([key]) => key === 'imagingReports').length
  registry.mockClear()
  mockLimit = 32_768
  const modelStart = performance.now()
  rerender(<DataSelectionPanel {...props} />)
  const modelMs = Math.round(performance.now() - modelStart)
  const modelBuilds = registry.mock.calls.filter(([key]) => key === 'imagingReports').length
  expect(documentBuilds).toBe(0)
  expect(modelBuilds).toBe(0)
  expect(screen.getAllByRole('checkbox')[index]).toBeChecked()
  console.info('Synthetic interaction diagnosis', { documentMs, documentBuilds, modelMs, modelBuilds, savedDocumentCount: mockProfile.documentIds.length, displayedDocumentCount: screen.getAllByRole('checkbox').filter(el => (el as HTMLInputElement).checked).length })
  unmount()
  registry.mockRestore()
}, 60_000)
