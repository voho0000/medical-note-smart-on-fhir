// Repository Interface: Clinical Data
import type {
  ConditionEntity,
  MedicationEntity,
  AllergyEntity,
  ObservationEntity,
  DiagnosticReportEntity,
  ImagingStudyEntity,
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

  /** Fetch imaging study metadata. DICOM instances are not downloaded. */
  fetchImagingStudies(patientId: string): Promise<ImagingStudyEntity[]>
  
  /**
   * Fetch procedures
   */
  fetchProcedures(patientId: string): Promise<ProcedureEntity[]>
  
  /**
   * Fetch encounters
   */
  fetchEncounters(patientId: string): Promise<EncounterEntity[]>
}
