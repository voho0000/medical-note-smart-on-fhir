import { QueryFhirDataUseCase } from '@/src/core/use-cases/agent/query-fhir-data.use-case'
import type { QueryFhirDataInput } from '@/src/core/use-cases/agent/query-fhir-data.use-case'

describe('QueryFhirDataUseCase', () => {
  let useCase: QueryFhirDataUseCase
  let mockFhirClient: any

  beforeEach(() => {
    useCase = new QueryFhirDataUseCase()
    mockFhirClient = {
      request: jest.fn()
    }
  })

  describe('execute', () => {
    it('should query FHIR data successfully', async () => {
      const input: QueryFhirDataInput = {
        resourceType: 'Condition',
        patientId: 'patient-123'
      }

      const mockResponse = {
        entry: [
          { resource: { id: '1', resourceType: 'Condition' } },
          { resource: { id: '2', resourceType: 'Condition' } }
        ]
      }

      mockFhirClient.request.mockResolvedValue(mockResponse)

      const result = await useCase.execute(input, mockFhirClient)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(mockResponse)
      expect(result.summary).toContain('Found 2 Condition')
      expect(mockFhirClient.request).toHaveBeenCalledWith(
        expect.stringContaining('Condition?patient=patient-123')
      )
    })

    it('should include default parameters for Condition', async () => {
      const input: QueryFhirDataInput = {
        resourceType: 'Condition',
        patientId: 'patient-123'
      }

      mockFhirClient.request.mockResolvedValue({ entry: [] })

      await useCase.execute(input, mockFhirClient)

      expect(mockFhirClient.request).toHaveBeenCalledWith(
        expect.stringContaining('_count=100')
      )
      expect(mockFhirClient.request).toHaveBeenCalledWith(
        expect.stringContaining('_sort=-recorded-date')
      )
    })

    it('should include default parameters for MedicationRequest', async () => {
      const input: QueryFhirDataInput = {
        resourceType: 'MedicationRequest',
        patientId: 'patient-123'
      }

      mockFhirClient.request.mockResolvedValue({ entry: [] })

      await useCase.execute(input, mockFhirClient)

      expect(mockFhirClient.request).toHaveBeenCalledWith(
        expect.stringContaining('_sort=-authoredon')
      )
    })

    it('should merge custom parameters with defaults', async () => {
      const input: QueryFhirDataInput = {
        resourceType: 'Observation',
        patientId: 'patient-123',
        parameters: { 'code': 'vital-signs' }
      }

      mockFhirClient.request.mockResolvedValue({ entry: [] })

      await useCase.execute(input, mockFhirClient)

      const callArg = mockFhirClient.request.mock.calls[0][0]
      expect(callArg).toContain('code=vital-signs')
      expect(callArg).toContain('_count=200')
    })

    it('should handle empty results', async () => {
      const input: QueryFhirDataInput = {
        resourceType: 'AllergyIntolerance',
        patientId: 'patient-123'
      }

      mockFhirClient.request.mockResolvedValue({ entry: [] })

      const result = await useCase.execute(input, mockFhirClient)

      expect(result.success).toBe(true)
      expect(result.summary).toContain('Found 0 AllergyIntolerance')
    })

    it('should handle FHIR client errors', async () => {
      const input: QueryFhirDataInput = {
        resourceType: 'Condition',
        patientId: 'patient-123'
      }

      mockFhirClient.request.mockRejectedValue(new Error('Network error'))

      const result = await useCase.execute(input, mockFhirClient)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Network error')
      expect(result.summary).toContain('Failed to query Condition')
    })

    it('should handle unknown errors', async () => {
      const input: QueryFhirDataInput = {
        resourceType: 'Procedure',
        patientId: 'patient-123'
      }

      mockFhirClient.request.mockRejectedValue('Unknown error')

      const result = await useCase.execute(input, mockFhirClient)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Unknown error occurred')
    })

    it('should query Patient resource', async () => {
      const input: QueryFhirDataInput = {
        resourceType: 'Patient',
        patientId: 'patient-123'
      }

      mockFhirClient.request.mockResolvedValue({ entry: [{ resource: {} }] })

      const result = await useCase.execute(input, mockFhirClient)

      expect(result.success).toBe(true)
      expect(mockFhirClient.request).toHaveBeenCalledWith(
        'Patient?patient=patient-123'
      )
    })

    it('should handle DiagnosticReport with custom count', async () => {
      const input: QueryFhirDataInput = {
        resourceType: 'DiagnosticReport',
        patientId: 'patient-123',
        parameters: { '_count': '10' }
      }

      mockFhirClient.request.mockResolvedValue({ entry: [] })

      await useCase.execute(input, mockFhirClient)

      expect(mockFhirClient.request).toHaveBeenCalledWith(
        expect.stringContaining('_count=10')
      )
    })
  })
})
