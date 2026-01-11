// FHIR Clinical Data Repository Implementation
import type { IClinicalDataRepository } from '@/src/core/interfaces/repositories/clinical-data.repository.interface'
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
import { fhirClient } from '../client/fhir-client.service'
import { ClinicalDataMapper } from '../mappers/clinical-data.mapper'
import { FHIR_RESOURCES } from '@/src/shared/constants/fhir-systems.constants'

export class FhirClinicalDataRepository implements IClinicalDataRepository {
  async fetchAllClinicalData(patientId: string): Promise<ClinicalDataCollection> {
    const [
      conditions,
      medications,
      allergies,
      observations,
      vitalSigns,
      diagnosticReports,
      procedures,
      encounters
    ] = await Promise.all([
      this.fetchConditions(patientId),
      this.fetchMedications(patientId),
      this.fetchAllergies(patientId),
      this.fetchObservations(patientId),
      this.fetchVitalSigns(patientId),
      this.fetchDiagnosticReports(patientId),
      this.fetchProcedures(patientId),
      this.fetchEncounters(patientId)
    ])

    return {
      conditions,
      medications,
      allergies,
      observations,
      vitalSigns,
      diagnosticReports,
      procedures,
      encounters
    }
  }

  async fetchConditions(patientId: string): Promise<ConditionEntity[]> {
    try {
      const response = await fhirClient.request(
        `Condition?patient=${patientId}&_sort=-recorded-date&_count=100`
      )
      return response.entry?.map((e: any) => ClinicalDataMapper.toCondition(e.resource)) || []
    } catch (error) {
      console.warn('Failed to sort conditions, trying without sort:', error)
      try {
        const response = await fhirClient.request(`Condition?patient=${patientId}&_count=100`)
        return response.entry?.map((e: any) => ClinicalDataMapper.toCondition(e.resource)) || []
      } catch (fallbackError) {
        console.error('Failed to fetch conditions:', fallbackError)
        return []
      }
    }
  }

  async fetchMedications(patientId: string): Promise<MedicationEntity[]> {
    try {
      const response = await fhirClient.request(
        `MedicationRequest?patient=${patientId}&_sort=-authoredon&_count=100`
      )
      return response.entry?.map((e: any) => ClinicalDataMapper.toMedication(e.resource)) || []
    } catch (error) {
      console.error('Failed to fetch medications:', error)
      return []
    }
  }

  async fetchAllergies(patientId: string): Promise<AllergyEntity[]> {
    try {
      const response = await fhirClient.request(
        `AllergyIntolerance?patient=${patientId}&_count=100`
      )
      return response.entry?.map((e: any) => ClinicalDataMapper.toAllergy(e.resource)) || []
    } catch (error) {
      console.error('Failed to fetch allergies:', error)
      return []
    }
  }

  async fetchObservations(patientId: string): Promise<ObservationEntity[]> {
    try {
      let response = await fhirClient.request(
        `Observation?patient=${patientId}&category=laboratory&_count=200&_sort=-date`
      )

      if (!response?.entry?.length) {
        response = await fhirClient.request(
          `Observation?patient=${patientId}&_count=200&_sort=-date`
        )
      }

      return response.entry?.map((e: any) => ClinicalDataMapper.toObservation(e.resource)) || []
    } catch (error) {
      console.error('Failed to fetch observations:', error)
      return []
    }
  }

  async fetchVitalSigns(patientId: string): Promise<ObservationEntity[]> {
    try {
      const response = await fhirClient.request(
        `Observation?patient=${patientId}&category=vital-signs&_sort=-date&_count=200`
      )
      return response.entry?.map((e: any) => ClinicalDataMapper.toObservation(e.resource)) || []
    } catch (error) {
      console.error('Failed to fetch vital signs:', error)
      return []
    }
  }

  async fetchDiagnosticReports(patientId: string): Promise<DiagnosticReportEntity[]> {
    try {
      const response = await fhirClient.request(
        `DiagnosticReport?patient=${patientId}&_count=50&_sort=-date&_include=DiagnosticReport:result&_include:iterate=Observation:has-member`
      )

      const entries = response.entry || []
      const reports = entries
        .filter((e: any) => e.resource?.resourceType === FHIR_RESOURCES.DIAGNOSTIC_REPORT)
        .map((e: any) => e.resource)

      const observations = entries
        .filter((e: any) => e.resource?.resourceType === FHIR_RESOURCES.OBSERVATION)
        .map((e: any) => ClinicalDataMapper.toObservation(e.resource))

      return reports.map((report: any) => 
        ClinicalDataMapper.toDiagnosticReport(report, observations)
      )
    } catch (error) {
      console.error('Failed to fetch diagnostic reports:', error)
      return []
    }
  }

  async fetchProcedures(patientId: string): Promise<ProcedureEntity[]> {
    try {
      const response = await fhirClient.request(
        `Procedure?patient=${patientId}&_count=100&_sort=-date`
      )
      return response.entry?.map((e: any) => ClinicalDataMapper.toProcedure(e.resource)) || []
    } catch (error) {
      console.error('Failed to fetch procedures:', error)
      return []
    }
  }

  async fetchEncounters(patientId: string): Promise<EncounterEntity[]> {
    try {
      const response = await fhirClient.request(
        `Encounter?patient=${patientId}&_sort=-date&_count=100&_include=Encounter:patient&_include=Encounter:location`
      )
      return response.entry?.map((e: any) => ClinicalDataMapper.toEncounter(e.resource)) || []
    } catch (error) {
      console.error('Failed to fetch encounters:', error)
      return []
    }
  }
}
