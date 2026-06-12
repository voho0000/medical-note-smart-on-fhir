// FHIR Patient Repository Implementation
import type { IPatientRepository } from '@/src/core/interfaces/repositories/patient.repository.interface'
import type { PatientEntity } from '@/src/core/entities/patient.entity'
import { fhirClient, LocalBundleModeError } from '../client/fhir-client.service'
import { PatientMapper } from '../mappers/patient.mapper'
import { FHIR_RESOURCES } from '@/src/shared/constants/fhir-systems.constants'

export class FhirPatientRepository implements IPatientRepository {
  async getCurrentPatient(): Promise<PatientEntity | null> {
    try {
      // Prefer the patient that fhirclient's SMART session pins to. The
      // standard SMART launch flow always sets `client.patient.id`; our
      // TWCAT `synthesizeSmartSession` bridge does the same. Falling back
      // to a `/Patient` search picks the first bundle entry, which on
      // multi-patient servers (e.g. 智群 OCTOFLOW with `example`,
      // `test-patient-001`, `pat-a123456789`) often lands on an orphan
      // demo record without any Observations attached — vitals card stays
      // empty even when real data exists for another patient on the
      // server. Reading by id avoids that.
      const client = await fhirClient.getClient()
       
      const pinnedId = (client as any)?.patient?.id as string | undefined
      if (pinnedId) {
        const resource = await fhirClient.request(`${FHIR_RESOURCES.PATIENT}/${pinnedId}`)
        return PatientMapper.toDomain(resource)
      }
      const response = await fhirClient.request(FHIR_RESOURCES.PATIENT)
      return PatientMapper.fromBundle(response)
    } catch (error) {
      // LocalBundleModeError is the "no SMART client" sentinel — expected
      // when callers race against a mode change; not a real failure.
      if (!(error instanceof LocalBundleModeError)) {
        console.error('[Patient Repository] Failed to fetch current patient:', error)
      }
      throw error
    }
  }

  async getPatientById(patientId: string): Promise<PatientEntity | null> {
    try {
      const response = await fhirClient.request(`Patient/${patientId}`)
      return PatientMapper.toDomain(response)
    } catch (error) {
      if (!(error instanceof LocalBundleModeError)) {
        console.error(`[Patient Repository] Failed to fetch patient ${patientId}:`, error)
      }
      throw error
    }
  }
}
