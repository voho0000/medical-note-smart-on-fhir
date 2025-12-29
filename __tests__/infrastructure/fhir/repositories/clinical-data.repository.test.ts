// Unit Tests: Clinical Data Repository
import { FhirClinicalDataRepository } from '@/src/infrastructure/fhir/repositories/clinical-data.repository'
import { fhirClient } from '@/src/infrastructure/fhir/client/fhir-client.service'
import { ClinicalDataMapper } from '@/src/infrastructure/fhir/mappers/clinical-data.mapper'

// Mock the dependencies
jest.mock('@/src/infrastructure/fhir/client/fhir-client.service')
jest.mock('@/src/infrastructure/fhir/mappers/clinical-data.mapper')

describe('FhirClinicalDataRepository', () => {
  let repository: FhirClinicalDataRepository
  let mockFhirClient: jest.Mocked<typeof fhirClient>
  let mockMapper: jest.Mocked<typeof ClinicalDataMapper>

  beforeEach(() => {
    mockFhirClient = fhirClient as jest.Mocked<typeof fhirClient>
    mockMapper = ClinicalDataMapper as jest.Mocked<typeof ClinicalDataMapper>
    repository = new FhirClinicalDataRepository()
    jest.clearAllMocks()
  })

  describe('fetchAllClinicalData', () => {
    it('should fetch all clinical data types', async () => {
      // Mock all fetch methods
      const mockCondition = { id: 'cond-1', code: { text: 'Diabetes' } }
      const mockMedication = { id: 'med-1', medicationCodeableConcept: { text: 'Metformin' }, status: 'active', intent: 'order' }
      const mockAllergy = { id: 'allergy-1', code: { text: 'Penicillin' } }
      const mockObservation = { id: 'obs-1', code: { text: 'Glucose' }, status: 'final' }
      const mockVital = { id: 'vital-1', code: { text: 'BP' }, status: 'final' }
      const mockReport = { id: 'report-1', code: { text: 'CBC' }, status: 'final' }
      const mockProcedure = { id: 'proc-1', code: { text: 'Surgery' }, status: 'completed' }
      const mockEncounter = { id: 'enc-1', status: 'finished' }

      mockFhirClient.request.mockImplementation((url: string) => {
        if (url.includes('Condition')) return Promise.resolve({ entry: [{ resource: {} }] })
        if (url.includes('MedicationRequest')) return Promise.resolve({ entry: [{ resource: {} }] })
        if (url.includes('AllergyIntolerance')) return Promise.resolve({ entry: [{ resource: {} }] })
        if (url.includes('Observation') && url.includes('laboratory')) return Promise.resolve({ entry: [{ resource: {} }] })
        if (url.includes('Observation') && url.includes('vital-signs')) return Promise.resolve({ entry: [{ resource: {} }] })
        if (url.includes('DiagnosticReport')) return Promise.resolve({ entry: [{ resource: { resourceType: 'DiagnosticReport' } }] })
        if (url.includes('Procedure')) return Promise.resolve({ entry: [{ resource: {} }] })
        if (url.includes('Encounter')) return Promise.resolve({ entry: [{ resource: {} }] })
        return Promise.resolve({ entry: [] })
      })

      mockMapper.toCondition.mockReturnValue(mockCondition)
      mockMapper.toMedication.mockReturnValue(mockMedication)
      mockMapper.toAllergy.mockReturnValue(mockAllergy)
      mockMapper.toObservation.mockReturnValue(mockObservation)
      mockMapper.toDiagnosticReport.mockReturnValue(mockReport)
      mockMapper.toProcedure.mockReturnValue(mockProcedure)
      mockMapper.toEncounter.mockReturnValue(mockEncounter)

      const result = await repository.fetchAllClinicalData('patient-123')

      expect(result.conditions).toHaveLength(1)
      expect(result.medications).toHaveLength(1)
      expect(result.allergies).toHaveLength(1)
      expect(result.observations).toHaveLength(1)
      expect(result.vitalSigns).toHaveLength(1)
      expect(result.diagnosticReports).toHaveLength(1)
      expect(result.procedures).toHaveLength(1)
      expect(result.encounters).toHaveLength(1)
    })

    it('should handle empty responses', async () => {
      mockFhirClient.request.mockResolvedValue({ entry: [] })

      const result = await repository.fetchAllClinicalData('patient-123')

      expect(result.conditions).toHaveLength(0)
      expect(result.medications).toHaveLength(0)
      expect(result.allergies).toHaveLength(0)
    })
  })

  describe('fetchConditions', () => {
    it('should fetch conditions successfully', async () => {
      const mockResponse = {
        entry: [
          { resource: { id: 'cond-1', code: { text: 'Diabetes' } } },
          { resource: { id: 'cond-2', code: { text: 'Hypertension' } } }
        ]
      }
      mockFhirClient.request.mockResolvedValue(mockResponse)
      mockMapper.toCondition.mockImplementation((r: any) => ({ id: r.id, code: r.code }))

      const result = await repository.fetchConditions('patient-123')

      expect(result).toHaveLength(2)
      expect(mockFhirClient.request).toHaveBeenCalledWith(
        expect.stringContaining('Condition?patient=patient-123')
      )
    })

    it('should fallback when sort fails', async () => {
      const mockResponse = { entry: [{ resource: { id: 'cond-1' } }] }
      mockFhirClient.request
        .mockRejectedValueOnce(new Error('Sort not supported'))
        .mockResolvedValueOnce(mockResponse)
      mockMapper.toCondition.mockReturnValue({ id: 'cond-1', code: { text: 'Test' } })

      const result = await repository.fetchConditions('patient-123')

      expect(result).toHaveLength(1)
      expect(mockFhirClient.request).toHaveBeenCalledTimes(2)
    })

    it('should return empty array on complete failure', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
      mockFhirClient.request.mockRejectedValue(new Error('Network error'))

      const result = await repository.fetchConditions('patient-123')

      expect(result).toEqual([])
      expect(consoleErrorSpy).toHaveBeenCalled()
      consoleErrorSpy.mockRestore()
    })

    it('should handle missing entry field', async () => {
      mockFhirClient.request.mockResolvedValue({})

      const result = await repository.fetchConditions('patient-123')

      expect(result).toEqual([])
    })
  })

  describe('fetchMedications', () => {
    it('should fetch medications successfully', async () => {
      const mockResponse = {
        entry: [{ resource: { id: 'med-1', medicationCodeableConcept: { text: 'Aspirin' } } }]
      }
      mockFhirClient.request.mockResolvedValue(mockResponse)
      mockMapper.toMedication.mockReturnValue({ id: 'med-1', medicationCodeableConcept: { text: 'Aspirin' }, status: 'active', intent: 'order' })

      const result = await repository.fetchMedications('patient-123')

      expect(result).toHaveLength(1)
      expect(mockFhirClient.request).toHaveBeenCalledWith(
        expect.stringContaining('MedicationRequest?patient=patient-123')
      )
    })

    it('should return empty array on error', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
      mockFhirClient.request.mockRejectedValue(new Error('Fetch error'))

      const result = await repository.fetchMedications('patient-123')

      expect(result).toEqual([])
      consoleErrorSpy.mockRestore()
    })
  })

  describe('fetchAllergies', () => {
    it('should fetch allergies successfully', async () => {
      const mockResponse = {
        entry: [{ resource: { id: 'allergy-1', code: { text: 'Peanuts' } } }]
      }
      mockFhirClient.request.mockResolvedValue(mockResponse)
      mockMapper.toAllergy.mockReturnValue({ id: 'allergy-1', code: { text: 'Peanuts' } })

      const result = await repository.fetchAllergies('patient-123')

      expect(result).toHaveLength(1)
    })

    it('should return empty array on error', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
      mockFhirClient.request.mockRejectedValue(new Error('Error'))

      const result = await repository.fetchAllergies('patient-123')

      expect(result).toEqual([])
      consoleErrorSpy.mockRestore()
    })
  })

  describe('fetchObservations', () => {
    it('should fetch laboratory observations', async () => {
      const mockResponse = {
        entry: [{ resource: { id: 'obs-1', code: { text: 'Glucose' } } }]
      }
      mockFhirClient.request.mockResolvedValue(mockResponse)
      mockMapper.toObservation.mockReturnValue({ id: 'obs-1', code: { text: 'Glucose' }, status: 'final' })

      const result = await repository.fetchObservations('patient-123')

      expect(result).toHaveLength(1)
      expect(mockFhirClient.request).toHaveBeenCalledWith(
        expect.stringContaining('category=laboratory')
      )
    })

    it('should fallback to all observations if no laboratory results', async () => {
      const mockResponse = { entry: [{ resource: { id: 'obs-1' } }] }
      mockFhirClient.request
        .mockResolvedValueOnce({ entry: [] })
        .mockResolvedValueOnce(mockResponse)
      mockMapper.toObservation.mockReturnValue({ id: 'obs-1', code: { text: 'Test' }, status: 'final' })

      const result = await repository.fetchObservations('patient-123')

      expect(result).toHaveLength(1)
      expect(mockFhirClient.request).toHaveBeenCalledTimes(2)
    })

    it('should return empty array on error', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
      mockFhirClient.request.mockRejectedValue(new Error('Error'))

      const result = await repository.fetchObservations('patient-123')

      expect(result).toEqual([])
      consoleErrorSpy.mockRestore()
    })
  })

  describe('fetchVitalSigns', () => {
    it('should fetch vital signs', async () => {
      const mockResponse = {
        entry: [{ resource: { id: 'vital-1', code: { text: 'Blood Pressure' } } }]
      }
      mockFhirClient.request.mockResolvedValue(mockResponse)
      mockMapper.toObservation.mockReturnValue({ id: 'vital-1', code: { text: 'Blood Pressure' }, status: 'final' })

      const result = await repository.fetchVitalSigns('patient-123')

      expect(result).toHaveLength(1)
      expect(mockFhirClient.request).toHaveBeenCalledWith(
        expect.stringContaining('category=vital-signs')
      )
    })
  })

  describe('fetchDiagnosticReports', () => {
    it('should fetch diagnostic reports with observations', async () => {
      const mockResponse = {
        entry: [
          { resource: { resourceType: 'DiagnosticReport', id: 'report-1', code: { text: 'CBC' } } },
          { resource: { resourceType: 'Observation', id: 'obs-1', code: { text: 'Hemoglobin' } } }
        ]
      }
      mockFhirClient.request.mockResolvedValue(mockResponse)
      mockMapper.toObservation.mockReturnValue({ id: 'obs-1', code: { text: 'Hemoglobin' }, status: 'final' })
      mockMapper.toDiagnosticReport.mockReturnValue({ id: 'report-1', code: { text: 'CBC' }, status: 'final' })

      const result = await repository.fetchDiagnosticReports('patient-123')

      expect(result).toHaveLength(1)
      expect(mockMapper.toDiagnosticReport).toHaveBeenCalled()
    })

    it('should return empty array on error', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
      mockFhirClient.request.mockRejectedValue(new Error('Error'))

      const result = await repository.fetchDiagnosticReports('patient-123')

      expect(result).toEqual([])
      consoleErrorSpy.mockRestore()
    })
  })

  describe('fetchProcedures', () => {
    it('should fetch procedures', async () => {
      const mockResponse = {
        entry: [{ resource: { id: 'proc-1', code: { text: 'Surgery' } } }]
      }
      mockFhirClient.request.mockResolvedValue(mockResponse)
      mockMapper.toProcedure.mockReturnValue({ id: 'proc-1', code: { text: 'Surgery' }, status: 'completed' })

      const result = await repository.fetchProcedures('patient-123')

      expect(result).toHaveLength(1)
    })
  })

  describe('fetchEncounters', () => {
    it('should fetch encounters', async () => {
      const mockResponse = {
        entry: [{ resource: { id: 'enc-1', status: 'finished' } }]
      }
      mockFhirClient.request.mockResolvedValue(mockResponse)
      mockMapper.toEncounter.mockReturnValue({ id: 'enc-1', status: 'finished' })

      const result = await repository.fetchEncounters('patient-123')

      expect(result).toHaveLength(1)
    })
  })
})
