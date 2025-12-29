// Unit Tests: Patient Repository
import { FhirPatientRepository } from '@/src/infrastructure/fhir/repositories/patient.repository'
import { fhirClient } from '@/src/infrastructure/fhir/client/fhir-client.service'
import { PatientMapper } from '@/src/infrastructure/fhir/mappers/patient.mapper'
import type { PatientEntity } from '@/src/core/entities/patient.entity'

// Mock the dependencies
jest.mock('@/src/infrastructure/fhir/client/fhir-client.service')
jest.mock('@/src/infrastructure/fhir/mappers/patient.mapper')

describe('FhirPatientRepository', () => {
  let repository: FhirPatientRepository
  let mockFhirClient: jest.Mocked<typeof fhirClient>
  let mockPatientMapper: jest.Mocked<typeof PatientMapper>

  beforeEach(() => {
    mockFhirClient = fhirClient as jest.Mocked<typeof fhirClient>
    mockPatientMapper = PatientMapper as jest.Mocked<typeof PatientMapper>
    repository = new FhirPatientRepository()
    jest.clearAllMocks()
  })

  describe('getCurrentPatient', () => {
    it('should fetch and map current patient successfully', async () => {
      // Arrange
      const mockResponse = {
        resourceType: 'Bundle',
        entry: [
          {
            resource: {
              resourceType: 'Patient',
              id: 'patient-123',
              name: [{ given: ['John'], family: 'Doe' }]
            }
          }
        ]
      }
      const mockPatient: PatientEntity = {
        id: 'patient-123',
        resourceType: 'Patient',
        name: [{ given: ['John'], family: 'Doe' }],
        gender: 'male',
        birthDate: '1990-01-15',
        age: 34
      }

      mockFhirClient.request.mockResolvedValue(mockResponse)
      mockPatientMapper.fromBundle.mockReturnValue(mockPatient)

      // Act
      const result = await repository.getCurrentPatient()

      // Assert
      expect(result).toEqual(mockPatient)
      expect(mockFhirClient.request).toHaveBeenCalledWith('Patient')
      expect(mockPatientMapper.fromBundle).toHaveBeenCalledWith(mockResponse)
    })

    it('should return null when mapper returns null', async () => {
      // Arrange
      const mockResponse = { resourceType: 'Bundle', entry: [] }
      mockFhirClient.request.mockResolvedValue(mockResponse)
      mockPatientMapper.fromBundle.mockReturnValue(null)

      // Act
      const result = await repository.getCurrentPatient()

      // Assert
      expect(result).toBeNull()
    })

    it('should throw error when FHIR client fails', async () => {
      // Arrange
      const error = new Error('Network error')
      mockFhirClient.request.mockRejectedValue(error)

      // Act & Assert
      await expect(repository.getCurrentPatient()).rejects.toThrow('Failed to fetch patient data')
    })

    it('should log error when fetch fails', async () => {
      // Arrange
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
      const error = new Error('FHIR error')
      mockFhirClient.request.mockRejectedValue(error)

      // Act
      try {
        await repository.getCurrentPatient()
      } catch (e) {
        // Expected
      }

      // Assert
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to fetch current patient:', error)
      consoleErrorSpy.mockRestore()
    })
  })

  describe('getPatientById', () => {
    it('should fetch and map patient by ID successfully', async () => {
      // Arrange
      const patientId = 'patient-456'
      const mockResponse = {
        resourceType: 'Patient',
        id: patientId,
        name: [{ given: ['Jane'], family: 'Smith' }],
        gender: 'female',
        birthDate: '1985-06-20'
      }
      const mockPatient: PatientEntity = {
        id: patientId,
        resourceType: 'Patient',
        name: [{ given: ['Jane'], family: 'Smith' }],
        gender: 'female',
        birthDate: '1985-06-20',
        age: 39
      }

      mockFhirClient.request.mockResolvedValue(mockResponse)
      mockPatientMapper.toDomain.mockReturnValue(mockPatient)

      // Act
      const result = await repository.getPatientById(patientId)

      // Assert
      expect(result).toEqual(mockPatient)
      expect(mockFhirClient.request).toHaveBeenCalledWith(`Patient/${patientId}`)
      expect(mockPatientMapper.toDomain).toHaveBeenCalledWith(mockResponse)
    })

    it('should return null when mapper returns null', async () => {
      // Arrange
      const patientId = 'invalid-patient'
      mockFhirClient.request.mockResolvedValue({})
      mockPatientMapper.toDomain.mockReturnValue(null)

      // Act
      const result = await repository.getPatientById(patientId)

      // Assert
      expect(result).toBeNull()
    })

    it('should throw error when FHIR client fails', async () => {
      // Arrange
      const patientId = 'patient-789'
      const error = new Error('Patient not found')
      mockFhirClient.request.mockRejectedValue(error)

      // Act & Assert
      await expect(repository.getPatientById(patientId)).rejects.toThrow('Failed to fetch patient data')
    })

    it('should log error with patient ID when fetch fails', async () => {
      // Arrange
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
      const patientId = 'patient-error'
      const error = new Error('Server error')
      mockFhirClient.request.mockRejectedValue(error)

      // Act
      try {
        await repository.getPatientById(patientId)
      } catch (e) {
        // Expected
      }

      // Assert
      expect(consoleErrorSpy).toHaveBeenCalledWith(`Failed to fetch patient ${patientId}:`, error)
      consoleErrorSpy.mockRestore()
    })

    it('should handle empty patient ID', async () => {
      // Arrange
      const patientId = ''
      mockFhirClient.request.mockResolvedValue({})
      mockPatientMapper.toDomain.mockReturnValue(null)

      // Act
      const result = await repository.getPatientById(patientId)

      // Assert
      expect(mockFhirClient.request).toHaveBeenCalledWith('Patient/')
      expect(result).toBeNull()
    })
  })
})
