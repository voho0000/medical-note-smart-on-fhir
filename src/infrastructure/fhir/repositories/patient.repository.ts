// FHIR Patient Repository Implementation
import type { IPatientRepository } from '@/src/core/interfaces/repositories/patient.repository.interface'
import type { PatientEntity } from '@/src/core/entities/patient.entity'
import { fhirClient } from '../client/fhir-client.service'
import { PatientMapper } from '../mappers/patient.mapper'
import { FHIR_RESOURCES } from '@/src/shared/constants/fhir-systems.constants'

export class FhirPatientRepository implements IPatientRepository {
  async getCurrentPatient(): Promise<PatientEntity | null> {
    try {
      const response = await fhirClient.request(FHIR_RESOURCES.PATIENT)
      return PatientMapper.fromBundle(response)
    } catch (error) {
      console.error('Failed to fetch current patient:', error)
      throw new Error('Failed to fetch patient data')
    }
  }

  async getPatientById(patientId: string): Promise<PatientEntity | null> {
    try {
      const response = await fhirClient.request(`Patient/${patientId}`)
      return PatientMapper.toDomain(response)
    } catch (error) {
      console.error(`Failed to fetch patient ${patientId}:`, error)
      throw new Error('Failed to fetch patient data')
    }
  }
}
