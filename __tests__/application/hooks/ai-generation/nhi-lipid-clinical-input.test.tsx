import { renderHook } from '@testing-library/react'
import { useClinicalAiInput } from '@/src/application/hooks/ai-generation/use-clinical-ai-input.hook'
import { ensureCategoriesInitialized } from '@/src/core/categories/init'
import { ALL_DATA_FILTERS, ALL_DATA_SELECTION } from '@/src/shared/constants/data-selection.constants'

const mockPatient = { id: 'nhi-lipid-scope-patient', gender: 'female', birthDate: '1960-01-01' }
const mockProfile = {
  selection: { ...ALL_DATA_SELECTION, documents: true },
  filters: { ...ALL_DATA_FILTERS },
  documentMode: 'all' as const,
  documentIds: [],
}
const mockData = {
  isLoading: false,
  isFetching: false,
  error: null,
  hasBlockingQueryIssues: false,
  conditions: [
    { id: 'cad', code: { text: 'Coronary artery disease' } },
    { id: 'eczema', code: { text: 'Eczema' } },
  ],
  medications: [],
  medicationRemainingSummaries: [],
  allergies: [],
  observations: [
    {
      id: 'ldl',
      status: 'final',
      effectiveDateTime: '2026-09-01',
      category: [{ coding: [{ code: 'laboratory' }] }],
      code: { text: 'LDL cholesterol', coding: [{ code: '2089-1', display: 'LDL cholesterol' }] },
      valueQuantity: { value: 142, unit: 'mg/dL' },
    },
    {
      id: 'wbc',
      status: 'final',
      effectiveDateTime: '2026-09-01',
      category: [{ coding: [{ code: 'laboratory' }] }],
      code: { text: 'White blood cell count', coding: [{ code: '6690-2', display: 'WBC' }] },
      valueQuantity: { value: 8.2, unit: '10*3/uL' },
    },
  ],
  vitalSigns: [],
  diagnosticReports: [],
  imagingStudies: [],
  procedures: [],
  encounters: [],
  documentReferences: [],
  compositions: [{
    id: 'cardiology-note',
    date: '2026-09-02',
    title: 'Cardiology note',
    type: { coding: [{ code: '18842-5' }] },
    text: { div: '<div>Current smoker.<br/>WBC 8.2.</div>' },
  }],
  immunizations: [],
  consents: [],
  devices: [],
  carePlans: [],
}

jest.mock('@/src/application/hooks/patient/use-patient-query.hook', () => ({
  usePatient: () => ({ patient: mockPatient }),
}))
jest.mock('@/src/application/hooks/clinical-data/use-clinical-data-query.hook', () => ({
  useClinicalData: () => mockData,
}))
jest.mock('@/src/application/providers/data-selection.provider', () => ({
  useDataSelection: () => ({ getProfile: () => mockProfile }),
}))
jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({ locale: 'en' }),
}))
jest.mock('@/src/application/providers/audience.provider', () => ({
  useAudience: () => ({ audience: 'medical' }),
}))
jest.mock('@/src/shared/hooks/use-now.hook', () => ({
  useNow: () => Date.parse('2026-09-20'),
}))

describe('NHI lipid clinical AI input', () => {
  beforeAll(() => ensureCategoriesInitialized())

  it('filters the actual NHI prompt and catalog while leaving AI Summary input unchanged', () => {
    const { result } = renderHook(() => ({
      lipid: useClinicalAiInput(128_000, 'nhiLipid', 0.62),
      summary: useClinicalAiInput(128_000, 'insights', 0.62),
    }))

    expect(result.current.lipid.dataReady).toBe(true)
    expect(result.current.lipid.clinicalContext).toContain('LDL')
    expect(result.current.lipid.clinicalContext).toContain('Current smoker')
    expect(result.current.lipid.clinicalContext).not.toMatch(/White blood cell|WBC 8\.2/i)
    expect(result.current.lipid.catalog.map((source) => source.resourceId)).toEqual(
      expect.arrayContaining(['ldl', 'cardiology-note']),
    )
    expect(result.current.lipid.catalog.map((source) => source.resourceId)).not.toContain('wbc')
    expect(result.current.lipid.clinicalData?.observations?.map((observation) => observation.id))
      .toEqual(['ldl'])

    expect(result.current.summary.dataReady).toBe(true)
    expect(result.current.summary.clinicalContext).toMatch(/White blood cell|WBC/)
    expect(result.current.summary.clinicalContext).toContain('WBC 8.2')
    expect(result.current.summary.catalog.map((source) => source.resourceId)).toContain('wbc')
    expect(result.current.summary.clinicalData?.observations?.map((observation) => observation.id))
      .toEqual(['ldl', 'wbc'])
  })
})
