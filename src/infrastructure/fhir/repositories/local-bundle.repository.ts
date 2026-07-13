// LocalBundleRepository
// Implements IClinicalDataRepository against the localStorage FHIR bundle.
import type { IClinicalDataRepository } from '@/src/core/interfaces/repositories/clinical-data.repository.interface'
import type {
  ConditionEntity,
  MedicationEntity,
  AllergyEntity,
  ObservationEntity,
  DiagnosticReportEntity,
  ImagingStudyEntity,
  ProcedureEntity,
  EncounterEntity,
  ClinicalDataCollection,
} from '@/src/core/entities/clinical-data.entity'
import { LocalBundleService } from '../services/local-bundle.service'

export class LocalBundleRepository implements IClinicalDataRepository {
  private collection: ClinicalDataCollection

  private constructor(collection: ClinicalDataCollection) {
    this.collection = collection
  }

  // Async factory: reading the bundle now hits IndexedDB (see LocalBundleService),
  // so construction can't happen synchronously in a plain constructor anymore.
  static async create(): Promise<LocalBundleRepository> {
    const data = await LocalBundleService.parseStored()
    const collection = data?.collection ?? {
      conditions: [], medications: [], allergies: [], observations: [],
      vitalSigns: [], diagnosticReports: [], imagingStudies: [], procedures: [], encounters: [],
      documentReferences: [], compositions: [], immunizations: [],
      consents: [], devices: [], carePlans: [],
    }
    return new LocalBundleRepository(collection)
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
  async fetchImagingStudies(_patientId: string): Promise<ImagingStudyEntity[]> {
    return this.collection.imagingStudies
  }
  async fetchProcedures(_patientId: string): Promise<ProcedureEntity[]> {
    return this.collection.procedures
  }
  async fetchEncounters(_patientId: string): Promise<EncounterEntity[]> {
    return this.collection.encounters
  }
}
