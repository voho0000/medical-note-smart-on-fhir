import { renderHook } from '@testing-library/react'
import { useClinicalData } from '@/src/application/hooks/clinical-data/use-clinical-data-query.hook'

const mockUseQuery = jest.fn()
const mockUsePatientQuery = jest.fn()

jest.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
}))

jest.mock('@/src/application/hooks/patient/use-patient-query.hook', () => ({
  usePatientQuery: () => mockUsePatientQuery(),
}))

const clinicalData = {
  conditions: [],
  medications: [],
  allergies: [],
  observations: [{ id: 'obs-1' }],
  vitalSigns: [],
  diagnosticReports: [],
  imagingStudies: [],
  procedures: [],
  encounters: [],
  documentReferences: [],
  compositions: [],
  immunizations: [],
  consents: [],
  devices: [],
  carePlans: [],
}

describe('useClinicalData', () => {
  const refetch = jest.fn()
  let clinicalFetching = false

  beforeEach(() => {
    jest.clearAllMocks()
    clinicalFetching = false
    mockUsePatientQuery.mockReturnValue({
      data: { id: 'patient-1' },
      isLoading: false,
      isFetching: false,
    })
    mockUseQuery.mockImplementation(() => ({
      data: clinicalData,
      isLoading: false,
      isFetching: clinicalFetching,
      error: null,
      refetch,
    }))
  })

  it('keeps the returned snapshot stable across unrelated parent renders', () => {
    const { result, rerender } = renderHook(() => useClinicalData())
    const firstSnapshot = result.current

    rerender()

    expect(result.current).toBe(firstSnapshot)
    expect(result.current.observations).toBe(clinicalData.observations)
  })

  it('publishes a new snapshot when React Query request state changes', () => {
    const { result, rerender } = renderHook(() => useClinicalData())
    const firstSnapshot = result.current

    clinicalFetching = true
    rerender()

    expect(result.current).not.toBe(firstSnapshot)
    expect(result.current.isFetching).toBe(true)
  })
})
