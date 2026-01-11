// FHIR Patient Mapper
import type { PatientEntity } from '@/src/core/entities/patient.entity'
import { calculateAge } from '@/src/core/entities/patient.entity'
import { FHIR_RESOURCES } from '@/src/shared/constants/fhir-systems.constants'

export class PatientMapper {
  static toDomain(fhirResource: any): PatientEntity | null {
    if (!fhirResource || fhirResource.resourceType !== FHIR_RESOURCES.PATIENT) {
      return null
    }

    const age = calculateAge(fhirResource.birthDate)

    return {
      id: fhirResource.id || '',
      resourceType: FHIR_RESOURCES.PATIENT,
      name: fhirResource.name,
      gender: fhirResource.gender,
      birthDate: fhirResource.birthDate,
      age: age ?? undefined
    }
  }

  static fromBundle(bundle: any): PatientEntity | null {
    if (!bundle) return null

    if (bundle.resourceType === FHIR_RESOURCES.PATIENT) {
      return this.toDomain(bundle)
    }

    if (bundle.resourceType === 'Bundle' && bundle.entry) {
      const patientEntry = bundle.entry.find(
        (e: any) => e.resource?.resourceType === FHIR_RESOURCES.PATIENT
      )
      return patientEntry ? this.toDomain(patientEntry.resource) : null
    }

    return null
  }
}
