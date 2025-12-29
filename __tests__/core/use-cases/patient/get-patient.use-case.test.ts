// Unit Tests: Get Patient Use Case
import { GetPatientUseCase } from '@/src/core/use-cases/patient/get-patient.use-case'
import type { IPatientRepository } from '@/src/core/interfaces/repositories/patient.repository.interface'
import type { PatientEntity } from '@/src/core/entities/patient.entity'

describe('GetPatientUseCase', () => {
  let useCase: GetPatientUseCase
  let mockRepository: jest.Mocked<IPatientRepository>

  beforeEach(() => {
    mockRepository = {
      getCurrentPatient: jest.fn(),
      getPatientById: jest.fn(),
    }
    useCase = new GetPatientUseCase(mockRepository)
  })

  describe('execute', () => {
    it('should return patient from repository', async () => {
      // Arrange
      const mockPatient: PatientEntity = {
        id: 'patient-123',
        resourceType: 'Patient',
        name: [{ given: ['John'], family: 'Doe' }],
        gender: 'male',
        birthDate: '1990-01-15',
        age: 34
      }
      mockRepository.getCurrentPatient.mockResolvedValue(mockPatient)

      // Act
      const result = await useCase.execute()

      // Assert
      expect(result).toEqual(mockPatient)
      expect(mockRepository.getCurrentPatient).toHaveBeenCalledTimes(1)
    })

    it('should return null when repository returns null', async () => {
      // Arrange
      mockRepository.getCurrentPatient.mockResolvedValue(null)

      // Act
      const result = await useCase.execute()

      // Assert
      expect(result).toBeNull()
      expect(mockRepository.getCurrentPatient).toHaveBeenCalledTimes(1)
    })

    it('should propagate repository errors', async () => {
      // Arrange
      const error = new Error('Repository error')
      mockRepository.getCurrentPatient.mockRejectedValue(error)

      // Act & Assert
      await expect(useCase.execute()).rejects.toThrow('Repository error')
      expect(mockRepository.getCurrentPatient).toHaveBeenCalledTimes(1)
    })

    it('should handle network errors', async () => {
      // Arrange
      mockRepository.getCurrentPatient.mockRejectedValue(new Error('Network error'))

      // Act & Assert
      await expect(useCase.execute()).rejects.toThrow('Network error')
    })
  })
})
