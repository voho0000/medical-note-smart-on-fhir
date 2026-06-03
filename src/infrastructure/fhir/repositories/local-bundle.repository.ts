// LocalBundleRepository
// Implements IClinicalDataRepository against the localStorage FHIR bundle.
import type { IClinicalDataRepository } from '@/src/core/interfaces/repositories/clinical-data.repository.interface'
import type {
  ConditionEntity,
  MedicationEntity,
  AllergyEntity,
  ObservationEntity,
  DiagnosticReportEntity,
  ProcedureEntity,
  EncounterEntity,
  ClinicalDataCollection,
} from '@/src/core/entities/clinical-data.entity'
import { LocalBundleService } from '../services/local-bundle.service'

export class LocalBundleRepository implements IClinicalDataRepository {
  private collection: ClinicalDataCollection

  constructor() {
    const data = LocalBundleService.parseStored()
    this.collection = data?.collection ?? {
      conditions: [], medications: [], allergies: [], observations: [],
      vitalSigns: [], diagnosticReports: [], procedures: [], encounters: [],
      documentReferences: [], compositions: [], immunizations: [],
      consents: [], devices: [], carePlans: [],
    }
  }

  async fetchAllClinicalData(_patientId: string): Promise<ClinicalDataCollection> {
    return this.collection
  }
  async fetchConditions(_patientId: string): Promise<ConditionEntity[]> {
    return this.collection.conditions
  }
  async fetchMedications(_patientId: string): Promise<MedicationEntity[]> {
    return this.collection.medications
  }
  async fetchAllergies(_patientId: string): Promise<AllergyEntity[]> {
    return this.collection.allergies
  }
  async fetchObservations(_patientId: string): Promise<ObservationEntity[]> {
    return this.collection.observations
  }
  async fetchVitalSigns(_patientId: string): Promise<ObservationEntity[]> {
    return this.collection.vitalSigns
  }
  async fetchDiagnosticReports(_patientId: string): Promise<DiagnosticReportEntity[]> {
    return this.collection.diagnosticReports
  }
  async fetchProcedures(_patientId: string): Promise<ProcedureEntity[]> {
    return this.collection.procedures
  }
  async fetchEncounters(_patientId: string): Promise<EncounterEntity[]> {
    return this.collection.encounters
  }
}
