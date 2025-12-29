// FHIR Patient Mapper
import type { PatientEntity } from '@/src/core/entities/patient.entity'
import { calculateAge } from '@/src/core/entities/patient.entity'

export class PatientMapper {
  static toDomain(fhirResource: any): PatientEntity | null {
    if (!fhirResource || fhirResource.resourceType !== 'Patient') {
      return null
    }

    const age = calculateAge(fhirResource.birthDate)

    return {
      id: fhirResource.id || '',
      resourceType: 'Patient',
      name: fhirResource.name,
      gender: fhirResource.gender,
      birthDate: fhirResource.birthDate,
      age: age ?? undefined
    }
  }

  static fromBundle(bundle: any): PatientEntity | null {
    if (!bundle) return null

    if (bundle.resourceType === 'Patient') {
      return this.toDomain(bundle)
    }

    if (bundle.resourceType === 'Bundle' && bundle.entry) {
      const patientEntry = bundle.entry.find(
        (e: any) => e.resource?.resourceType === 'Patient'
      )
      return patientEntry ? this.toDomain(patientEntry.resource) : null
    }

    return null
  }
}
