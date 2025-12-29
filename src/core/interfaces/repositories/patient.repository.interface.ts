// Repository Interface: Patient
import type { PatientEntity } from '@/src/core/entities/patient.entity'

export interface IPatientRepository {
  /**
   * Get current patient from FHIR context
   */
  getCurrentPatient(): Promise<PatientEntity | null>
  
  /**
   * Get patient by ID
   */
  getPatientById(patientId: string): Promise<PatientEntity | null>
}
