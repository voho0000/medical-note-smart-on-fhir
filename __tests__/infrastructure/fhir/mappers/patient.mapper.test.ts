// Unit Tests: Patient Mapper
import { PatientMapper } from '@/src/infrastructure/fhir/mappers/patient.mapper'
import type { PatientEntity } from '@/src/core/entities/patient.entity'

describe('PatientMapper', () => {
  describe('toDomain', () => {
    it('should map valid FHIR Patient resource to domain entity', () => {
      // Arrange
      const fhirPatient = {
        resourceType: 'Patient',
        id: 'patient-123',
        name: [
          {
            given: ['John', 'Michael'],
            family: 'Doe'
          }
        ],
        gender: 'male',
        birthDate: '1990-01-15'
      }

      // Act
      const result = PatientMapper.toDomain(fhirPatient)

      // Assert
      expect(result).not.toBeNull()
      expect(result?.id).toBe('patient-123')
      expect(result?.resourceType).toBe('Patient')
      expect(result?.name).toEqual(fhirPatient.name)
      expect(result?.gender).toBe('male')
      expect(result?.birthDate).toBe('1990-01-15')
      expect(result?.age).toBeGreaterThan(0)
    })

    it('should return null for null input', () => {
      expect(PatientMapper.toDomain(null)).toBeNull()
    })

    it('should return null for undefined input', () => {
      expect(PatientMapper.toDomain(undefined)).toBeNull()
    })

    it('should return null for non-Patient resource type', () => {
      const fhirResource = {
        resourceType: 'Observation',
        id: 'obs-123'
      }

      expect(PatientMapper.toDomain(fhirResource)).toBeNull()
    })

    it('should handle missing id with empty string', () => {
      const fhirPatient = {
        resourceType: 'Patient',
        name: [{ given: ['Jane'], family: 'Smith' }],
        gender: 'female',
        birthDate: '1985-06-20'
      }

      const result = PatientMapper.toDomain(fhirPatient)

      expect(result?.id).toBe('')
    })

    it('should handle missing birthDate', () => {
      const fhirPatient = {
        resourceType: 'Patient',
        id: 'patient-456',
        name: [{ given: ['Bob'], family: 'Johnson' }],
        gender: 'male'
      }

      const result = PatientMapper.toDomain(fhirPatient)

      expect(result?.age).toBeUndefined()
    })

    it('should handle invalid birthDate', () => {
      const fhirPatient = {
        resourceType: 'Patient',
        id: 'patient-789',
        name: [{ given: ['Alice'], family: 'Williams' }],
        gender: 'female',
        birthDate: 'invalid-date'
      }

      const result = PatientMapper.toDomain(fhirPatient)

      expect(result?.age).toBeUndefined()
    })

    it('should handle missing optional fields', () => {
      const fhirPatient = {
        resourceType: 'Patient',
        id: 'patient-minimal'
      }

      const result = PatientMapper.toDomain(fhirPatient)

      expect(result).not.toBeNull()
      expect(result?.id).toBe('patient-minimal')
      expect(result?.name).toBeUndefined()
      expect(result?.gender).toBeUndefined()
      expect(result?.birthDate).toBeUndefined()
    })
  })

  describe('fromBundle', () => {
    it('should extract Patient from direct Patient resource', () => {
      const fhirPatient = {
        resourceType: 'Patient',
        id: 'patient-direct',
        name: [{ given: ['Direct'], family: 'Patient' }],
        gender: 'other',
        birthDate: '2000-01-01'
      }

      const result = PatientMapper.fromBundle(fhirPatient)

      expect(result).not.toBeNull()
      expect(result?.id).toBe('patient-direct')
      expect(result?.resourceType).toBe('Patient')
    })

    it('should extract Patient from Bundle with entries', () => {
      const bundle = {
        resourceType: 'Bundle',
        entry: [
          {
            resource: {
              resourceType: 'Observation',
              id: 'obs-1'
            }
          },
          {
            resource: {
              resourceType: 'Patient',
              id: 'patient-from-bundle',
              name: [{ given: ['Bundle'], family: 'Patient' }],
              gender: 'female',
              birthDate: '1995-03-15'
            }
          },
          {
            resource: {
              resourceType: 'Condition',
              id: 'cond-1'
            }
          }
        ]
      }

      const result = PatientMapper.fromBundle(bundle)

      expect(result).not.toBeNull()
      expect(result?.id).toBe('patient-from-bundle')
      expect(result?.gender).toBe('female')
    })

    it('should return null for null bundle', () => {
      expect(PatientMapper.fromBundle(null)).toBeNull()
    })

    it('should return null for undefined bundle', () => {
      expect(PatientMapper.fromBundle(undefined)).toBeNull()
    })

    it('should return null for Bundle without Patient entry', () => {
      const bundle = {
        resourceType: 'Bundle',
        entry: [
          {
            resource: {
              resourceType: 'Observation',
              id: 'obs-1'
            }
          },
          {
            resource: {
              resourceType: 'Condition',
              id: 'cond-1'
            }
          }
        ]
      }

      expect(PatientMapper.fromBundle(bundle)).toBeNull()
    })

    it('should return null for Bundle with empty entries', () => {
      const bundle = {
        resourceType: 'Bundle',
        entry: []
      }

      expect(PatientMapper.fromBundle(bundle)).toBeNull()
    })

    it('should return null for Bundle without entries field', () => {
      const bundle = {
        resourceType: 'Bundle'
      }

      expect(PatientMapper.fromBundle(bundle)).toBeNull()
    })

    it('should return null for non-Bundle, non-Patient resource', () => {
      const resource = {
        resourceType: 'Observation',
        id: 'obs-123'
      }

      expect(PatientMapper.fromBundle(resource)).toBeNull()
    })

    it('should handle Bundle entry with missing resource', () => {
      const bundle = {
        resourceType: 'Bundle',
        entry: [
          {
            resource: null
          },
          {
            resource: {
              resourceType: 'Patient',
              id: 'patient-valid',
              birthDate: '1980-12-25'
            }
          }
        ]
      }

      const result = PatientMapper.fromBundle(bundle)

      expect(result).not.toBeNull()
      expect(result?.id).toBe('patient-valid')
    })
  })
})
