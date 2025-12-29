// Repository Interface: Clinical Data
import type {
  ConditionEntity,
  MedicationEntity,
  AllergyEntity,
  ObservationEntity,
  DiagnosticReportEntity,
  ProcedureEntity,
  EncounterEntity,
  ClinicalDataCollection
} from '@/src/core/entities/clinical-data.entity'

export interface IClinicalDataRepository {
  /**
   * Fetch all clinical data for a patient
   */
  fetchAllClinicalData(patientId: string): Promise<ClinicalDataCollection>
  
  /**
   * Fetch conditions (diagnoses)
   */
  fetchConditions(patientId: string): Promise<ConditionEntity[]>
  
  /**
   * Fetch medications
   */
  fetchMedications(patientId: string): Promise<MedicationEntity[]>
  
  /**
   * Fetch allergies
   */
  fetchAllergies(patientId: string): Promise<AllergyEntity[]>
  
  /**
   * Fetch observations (lab results)
   */
  fetchObservations(patientId: string): Promise<ObservationEntity[]>
  
  /**
   * Fetch vital signs
   */
  fetchVitalSigns(patientId: string): Promise<ObservationEntity[]>
  
  /**
   * Fetch diagnostic reports
   */
  fetchDiagnosticReports(patientId: string): Promise<DiagnosticReportEntity[]>
  
  /**
   * Fetch procedures
   */
  fetchProcedures(patientId: string): Promise<ProcedureEntity[]>
  
  /**
   * Fetch encounters
   */
  fetchEncounters(patientId: string): Promise<EncounterEntity[]>
}
