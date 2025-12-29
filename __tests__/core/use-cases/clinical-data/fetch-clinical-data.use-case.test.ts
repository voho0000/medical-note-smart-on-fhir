// Unit Tests: Fetch Clinical Data Use Case
import { FetchClinicalDataUseCase } from '@/src/core/use-cases/clinical-data/fetch-clinical-data.use-case'
import type { IClinicalDataRepository } from '@/src/core/interfaces/repositories/clinical-data.repository.interface'
import type { ClinicalDataCollection } from '@/src/core/entities/clinical-data.entity'

describe('FetchClinicalDataUseCase', () => {
  let useCase: FetchClinicalDataUseCase
  let mockRepository: jest.Mocked<IClinicalDataRepository>

  beforeEach(() => {
    mockRepository = {
      fetchAllClinicalData: jest.fn(),
      fetchConditions: jest.fn(),
      fetchMedications: jest.fn(),
      fetchAllergies: jest.fn(),
      fetchObservations: jest.fn(),
      fetchVitalSigns: jest.fn(),
      fetchDiagnosticReports: jest.fn(),
      fetchProcedures: jest.fn(),
      fetchEncounters: jest.fn(),
    }
    useCase = new FetchClinicalDataUseCase(mockRepository)
  })

  describe('execute', () => {
    it('should return clinical data from repository', async () => {
      // Arrange
      const mockData: ClinicalDataCollection = {
        conditions: [
          {
            id: 'cond-1',
            code: { text: 'Diabetes' },
            clinicalStatus: 'active',
            recordedDate: '2024-01-15'
          }
        ],
        medications: [
          {
            id: 'med-1',
            medicationCodeableConcept: { text: 'Metformin' },
            status: 'active',
            intent: 'order'
          }
        ],
        allergies: [],
        observations: [],
        vitalSigns: [],
        diagnosticReports: [],
        procedures: [],
        encounters: []
      }
      mockRepository.fetchAllClinicalData.mockResolvedValue(mockData)

      // Act
      const result = await useCase.execute('patient-123')

      // Assert
      expect(result).toEqual(mockData)
      expect(mockRepository.fetchAllClinicalData).toHaveBeenCalledWith('patient-123')
      expect(mockRepository.fetchAllClinicalData).toHaveBeenCalledTimes(1)
    })

    it('should return empty collections when repository returns empty data', async () => {
      // Arrange
      const emptyData: ClinicalDataCollection = {
        conditions: [],
        medications: [],
        allergies: [],
        observations: [],
        vitalSigns: [],
        diagnosticReports: [],
        procedures: [],
        encounters: []
      }
      mockRepository.fetchAllClinicalData.mockResolvedValue(emptyData)

      // Act
      const result = await useCase.execute('patient-123')

      // Assert
      expect(result).toEqual(emptyData)
      expect(result.conditions).toHaveLength(0)
      expect(result.medications).toHaveLength(0)
    })

    it('should propagate repository errors', async () => {
      // Arrange
      const error = new Error('Failed to fetch clinical data')
      mockRepository.fetchAllClinicalData.mockRejectedValue(error)

      // Act & Assert
      await expect(useCase.execute('patient-123')).rejects.toThrow('Failed to fetch clinical data')
      expect(mockRepository.fetchAllClinicalData).toHaveBeenCalledTimes(1)
    })

    it('should handle network timeout errors', async () => {
      // Arrange
      mockRepository.fetchAllClinicalData.mockRejectedValue(new Error('Request timeout'))

      // Act & Assert
      await expect(useCase.execute('patient-123')).rejects.toThrow('Request timeout')
    })
  })
})
