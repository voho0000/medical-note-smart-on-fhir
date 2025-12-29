// Unit Tests: Patient Entity Helper Functions
import { calculateAge, getPatientDisplayName } from '@/src/core/entities/patient.entity'
import type { PatientEntity } from '@/src/core/entities/patient.entity'

describe('Patient Entity Helper Functions', () => {
  describe('calculateAge', () => {
    beforeEach(() => {
      jest.useFakeTimers()
      jest.setSystemTime(new Date('2024-06-15'))
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('should calculate age correctly for a birth date', () => {
      const age = calculateAge('1990-01-15')
      expect(age).toBe(34)
    })

    it('should calculate age correctly when birthday has not occurred this year', () => {
      const age = calculateAge('1990-07-15')
      expect(age).toBe(33)
    })

    it('should calculate age correctly when birthday is today', () => {
      const age = calculateAge('1990-06-15')
      expect(age).toBe(34)
    })

    it('should calculate age correctly for someone born yesterday', () => {
      const age = calculateAge('2024-06-14')
      expect(age).toBe(0)
    })

    it('should return null for undefined birth date', () => {
      const age = calculateAge(undefined)
      expect(age).toBeNull()
    })

    it('should return null for null birth date', () => {
      const age = calculateAge(null)
      expect(age).toBeNull()
    })

    it('should return null for invalid date string', () => {
      const age = calculateAge('invalid-date')
      expect(age).toBeNull()
    })

    it('should return null for empty string', () => {
      const age = calculateAge('')
      expect(age).toBeNull()
    })

    it('should handle leap year births correctly', () => {
      const age = calculateAge('2000-02-29')
      expect(age).toBe(24)
    })

    it('should return null for future birth dates', () => {
      const age = calculateAge('2025-01-01')
      expect(age).toBeNull()
    })

    it('should calculate age for very old person', () => {
      const age = calculateAge('1920-01-01')
      expect(age).toBe(104)
    })

    it('should handle birth date at end of month', () => {
      const age = calculateAge('1990-01-31')
      expect(age).toBe(34)
    })

    it('should handle birth date at start of year', () => {
      const age = calculateAge('1990-01-01')
      expect(age).toBe(34)
    })

    it('should handle birth date at end of year', () => {
      const age = calculateAge('1989-12-31')
      expect(age).toBe(34)
    })
  })

  describe('getPatientDisplayName', () => {
    it('should format full name with given and family names', () => {
      const patient: PatientEntity = {
        id: 'patient-1',
        resourceType: 'Patient',
        name: [{ given: ['John', 'Michael'], family: 'Doe' }]
      }
      const name = getPatientDisplayName(patient)
      expect(name).toBe('John Michael Doe')
    })

    it('should format name with only given name', () => {
      const patient: PatientEntity = {
        id: 'patient-1',
        resourceType: 'Patient',
        name: [{ given: ['John'] }]
      }
      const name = getPatientDisplayName(patient)
      expect(name).toBe('John')
    })

    it('should format name with only family name', () => {
      const patient: PatientEntity = {
        id: 'patient-1',
        resourceType: 'Patient',
        name: [{ family: 'Doe' }]
      }
      const name = getPatientDisplayName(patient)
      expect(name).toBe('Doe')
    })

    it('should return Unknown Patient for null patient', () => {
      const name = getPatientDisplayName(null)
      expect(name).toBe('Unknown Patient')
    })

    it('should return Unknown Patient for patient without name', () => {
      const patient: PatientEntity = {
        id: 'patient-1',
        resourceType: 'Patient'
      }
      const name = getPatientDisplayName(patient)
      expect(name).toBe('Unknown Patient')
    })

    it('should return Unknown Patient for patient with empty name array', () => {
      const patient: PatientEntity = {
        id: 'patient-1',
        resourceType: 'Patient',
        name: []
      }
      const name = getPatientDisplayName(patient)
      expect(name).toBe('Unknown Patient')
    })

    it('should return Unknown Patient for patient with empty name object', () => {
      const patient: PatientEntity = {
        id: 'patient-1',
        resourceType: 'Patient',
        name: [{}]
      }
      const name = getPatientDisplayName(patient)
      expect(name).toBe('Unknown Patient')
    })

    it('should trim whitespace from names', () => {
      const patient: PatientEntity = {
        id: 'patient-1',
        resourceType: 'Patient',
        name: [{ given: ['  John  '], family: '  Doe  ' }]
      }
      const name = getPatientDisplayName(patient)
      expect(name).toBe('John Doe')
    })

    it('should handle multiple given names', () => {
      const patient: PatientEntity = {
        id: 'patient-1',
        resourceType: 'Patient',
        name: [{ given: ['John', 'Paul', 'George'], family: 'Smith' }]
      }
      const name = getPatientDisplayName(patient)
      expect(name).toBe('John Paul George Smith')
    })

    it('should handle empty given names array', () => {
      const patient: PatientEntity = {
        id: 'patient-1',
        resourceType: 'Patient',
        name: [{ given: [], family: 'Doe' }]
      }
      const name = getPatientDisplayName(patient)
      expect(name).toBe('Doe')
    })

    it('should use first name entry when multiple exist', () => {
      const patient: PatientEntity = {
        id: 'patient-1',
        resourceType: 'Patient',
        name: [
          { given: ['John'], family: 'Doe' },
          { given: ['Jane'], family: 'Smith' }
        ]
      }
      const name = getPatientDisplayName(patient)
      expect(name).toBe('John Doe')
    })

    it('should handle name with only whitespace', () => {
      const patient: PatientEntity = {
        id: 'patient-1',
        resourceType: 'Patient',
        name: [{ given: ['   '], family: '   ' }]
      }
      const name = getPatientDisplayName(patient)
      expect(name).toBe('Unknown Patient')
    })
  })
})
