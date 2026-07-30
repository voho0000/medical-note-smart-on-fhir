import {
  applyUserEnteredPatientProfile,
  createUserEnteredPatientProfile,
  isValidPatientBirthDate,
  parseUserEnteredPatientProfile,
  type PatientEntity,
} from '@/src/core/entities/patient.entity'

const sdkPatient: PatientEntity = {
  resourceType: 'Patient',
  id: 'sdk-patient',
  name: [{ text: 'Unknown' }],
  gender: 'unknown',
}

describe('user-entered SDK patient profile', () => {
  const now = new Date('2026-07-30T10:00:00+08:00')

  it('normalizes user input without inventing missing fields', () => {
    expect(createUserEnteredPatientProfile({
      name: '  王   小明  ',
      gender: 'male',
      birthDate: '1980-02-29',
    }, now)).toEqual({
      source: 'user-entered',
      name: '王 小明',
      gender: 'male',
      birthDate: '1980-02-29',
      updatedAt: now.toISOString(),
    })
    expect(createUserEnteredPatientProfile({}, now)).toBeNull()
  })

  it('rejects impossible and future birth dates', () => {
    expect(isValidPatientBirthDate('2024-02-29', now)).toBe(true)
    expect(isValidPatientBirthDate('2025-02-29', now)).toBe(false)
    expect(isValidPatientBirthDate('2026-07-31', now)).toBe(false)
    expect(() => createUserEnteredPatientProfile({
      birthDate: '2026-07-31',
    }, now)).toThrow('Invalid patient birth date')
  })

  it('fails closed when decrypted storage has an invalid shape', () => {
    expect(parseUserEnteredPatientProfile({
      source: 'sdk-guessed',
      name: '王小明',
      updatedAt: now.toISOString(),
    })).toBeNull()
    expect(parseUserEnteredPatientProfile({
      source: 'user-entered',
      birthDate: 'not-a-date',
      updatedAt: now.toISOString(),
    })).toBeNull()
  })

  it('overlays the App model while leaving the source Patient unchanged', () => {
    const profile = createUserEnteredPatientProfile({
      name: '王小明',
      gender: 'male',
      birthDate: '1980-01-15',
    }, now)
    const result = applyUserEnteredPatientProfile(sdkPatient, profile)

    expect(result).not.toBe(sdkPatient)
    expect(result.name).toEqual([{ use: 'usual', text: '王小明' }])
    expect(result.gender).toBe('male')
    expect(result.birthDate).toBe('1980-01-15')
    expect(result.demographicsSource).toBe('user-entered-local-profile')
    expect(result.userEnteredDemographicFields).toEqual([
      'name',
      'gender',
      'birthDate',
    ])
    expect(sdkPatient).toEqual({
      resourceType: 'Patient',
      id: 'sdk-patient',
      name: [{ text: 'Unknown' }],
      gender: 'unknown',
    })
  })
})
