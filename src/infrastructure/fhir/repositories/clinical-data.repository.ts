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
  DocumentReferenceEntity,
  CompositionEntity,
  ConsentEntity,
  DeviceEntity,
  CarePlanEntity,
  ClinicalDataCollection
} from '@/src/core/entities/clinical-data.entity'
import { fhirClient, LocalBundleModeError } from '../client/fhir-client.service'
import { FhirMapper } from '../mappers/fhir.mapper'
import { FHIR_RESOURCES } from '@/src/shared/constants/fhir-systems.constants'

// Skip console noise for the "no SMART client" sentinel — that's a planned
// fallback (user is in local-bundle mode or the data source went away
// mid-fetch), not a real failure.
function logFhirError(label: string, error: unknown) {
  if (error instanceof LocalBundleModeError) return
  console.error(label, error)
}
function warnFhirError(label: string, error: unknown) {
  if (error instanceof LocalBundleModeError) return
  console.warn(label, error)
}

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
      encounters,
      documentReferences,
      compositions,
      immunizations,
      consents,
      devices,
      carePlans
    ] = await Promise.all([
      this.fetchConditions(patientId),
      this.fetchMedications(patientId),
      this.fetchAllergies(patientId),
      this.fetchObservations(patientId),
      this.fetchVitalSigns(patientId),
      this.fetchDiagnosticReports(patientId),
      this.fetchProcedures(patientId),
      this.fetchEncounters(patientId),
      this.fetchDocumentReferences(patientId),
      this.fetchCompositions(patientId),
      this.fetchImmunizations(patientId),
      this.fetchConsents(patientId),
      this.fetchDevices(patientId),
      this.fetchCarePlans(patientId)
    ])

    // Re-attach observations to DiagnosticReports that _include didn't populate.
    // The bridge may not support _include; this mirrors what local-bundle.service does.
    const obsMap = new Map(observations.map(o => [o.id, o]))
    const enrichedDiagnosticReports = diagnosticReports.map(dr => {
      if (Array.isArray((dr as any)._observations) && (dr as any)._observations.length > 0) {
        return dr
      }
      if (!Array.isArray(dr.result) || dr.result.length === 0) return dr
      const resultIds = (dr.result as any[])
        .map((ref: any) => ref.reference?.split('/').pop())
        .filter(Boolean) as string[]
      const matched = resultIds.map(id => obsMap.get(id)).filter((o): o is ObservationEntity => o !== undefined)
      return matched.length > 0 ? { ...dr, _observations: matched } : dr
    })

    // Pharmacy-only MedicationRequests without an encounter reference are
    // intentionally LEFT ORPHAN — they still surface in the medication list,
    // but don't fabricate visits in the visit-history view. This mirrors the
    // NHI 健保存摺 data model: pharmacy events only appear as visits in the
    // IC-card section (where bridge v0.7.1+ tags them with type.text='藥局'),
    // never under the 申報資料 channel. See bridge bug report 2026-05-20.

    return {
      conditions,
      medications,
      allergies,
      observations,
      vitalSigns,
      diagnosticReports: enrichedDiagnosticReports,
      procedures,
      encounters,
      documentReferences,
      compositions,
      immunizations,
      consents,
      devices,
      carePlans
    }
  }

  async fetchConsents(patientId: string): Promise<ConsentEntity[]> {
    try {
      const response = await fhirClient.requestAllPages(
        `Consent?patient=${patientId}&_count=100`
      )
      return response.entry?.map((e: any) => FhirMapper.toConsent(e.resource)) || []
    } catch (error) {
      warnFhirError('Failed to fetch consents:', error)
      return []
    }
  }

  async fetchDevices(patientId: string): Promise<DeviceEntity[]> {
    try {
      const response = await fhirClient.requestAllPages(
        `Device?patient=${patientId}&_count=100`
      )
      return response.entry?.map((e: any) => FhirMapper.toDevice(e.resource)) || []
    } catch (error) {
      warnFhirError('Failed to fetch devices:', error)
      return []
    }
  }

  async fetchCarePlans(patientId: string): Promise<CarePlanEntity[]> {
    try {
      const response = await fhirClient.requestAllPages(
        `CarePlan?patient=${patientId}&_sort=-date&_count=100`
      )
      return response.entry?.map((e: any) => FhirMapper.toCarePlan(e.resource)) || []
    } catch (error) {
      warnFhirError('Failed to fetch care plans:', error)
      return []
    }
  }

  async fetchImmunizations(patientId: string): Promise<import('@/src/core/entities/clinical-data.entity').ImmunizationEntity[]> {
    try {
      const response = await fhirClient.requestAllPages(
        `Immunization?patient=${patientId}&_sort=-date&_count=200`
      )
      return response.entry?.map((e: any) => FhirMapper.toImmunization(e.resource)) || []
    } catch (error) {
      warnFhirError('Failed to fetch immunizations:', error)
      return []
    }
  }

  async fetchConditions(patientId: string): Promise<ConditionEntity[]> {
    try {
      const response = await fhirClient.requestAllPages(
        `Condition?patient=${patientId}&_sort=-recorded-date&_count=100`
      )
      return response.entry?.map((e: any) => FhirMapper.toCondition(e.resource)) || []
    } catch (error) {
      warnFhirError('Failed to sort conditions, trying without sort:', error)
      try {
        const response = await fhirClient.requestAllPages(`Condition?patient=${patientId}&_count=100`)
        return response.entry?.map((e: any) => FhirMapper.toCondition(e.resource)) || []
      } catch (fallbackError) {
        logFhirError('Failed to fetch conditions:', fallbackError)
        return []
      }
    }
  }

  async fetchMedications(patientId: string): Promise<MedicationEntity[]> {
    try {
      const response = await fhirClient.requestAllPages(
        `MedicationRequest?patient=${patientId}&_sort=-authoredon&_count=100`
      )
      return response.entry?.map((e: any) => FhirMapper.toMedication(e.resource)) || []
    } catch (error) {
      logFhirError('Failed to fetch medications:', error)
      return []
    }
  }

  async fetchAllergies(patientId: string): Promise<AllergyEntity[]> {
    try {
      const response = await fhirClient.requestAllPages(
        `AllergyIntolerance?patient=${patientId}&_count=100`
      )
      return response.entry?.map((e: any) => FhirMapper.toAllergy(e.resource)) || []
    } catch (error) {
      logFhirError('Failed to fetch allergies:', error)
      return []
    }
  }

  async fetchObservations(patientId: string): Promise<ObservationEntity[]> {
    try {
      // Fetch all observations (laboratory, procedure, etc.)
      const response = await fhirClient.requestAllPages(
        `Observation?patient=${patientId}&_count=200&_sort=-date`
      )

      return response.entry?.map((e: any) => FhirMapper.toObservation(e.resource)) || []
    } catch (error) {
      logFhirError('Failed to fetch observations:', error)
      return []
    }
  }

  async fetchVitalSigns(patientId: string): Promise<ObservationEntity[]> {
    try {
      const response = await fhirClient.requestAllPages(
        `Observation?patient=${patientId}&category=vital-signs&_sort=-date&_count=200`
      )
      return response.entry?.map((e: any) => FhirMapper.toObservation(e.resource)) || []
    } catch (error) {
      logFhirError('Failed to fetch vital signs:', error)
      return []
    }
  }

  async fetchDiagnosticReports(patientId: string): Promise<DiagnosticReportEntity[]> {
    try {
      const response = await fhirClient.requestAllPages(
        `DiagnosticReport?patient=${patientId}&_count=500&_sort=-date&_include=DiagnosticReport:result&_include:iterate=Observation:has-member`
      )

      const entries = response.entry || []
      const reports = entries
        .filter((e: any) => e.resource?.resourceType === FHIR_RESOURCES.DIAGNOSTIC_REPORT)
        .map((e: any) => e.resource)

      const observations = entries
        .filter((e: any) => e.resource?.resourceType === FHIR_RESOURCES.OBSERVATION)
        .map((e: any) => FhirMapper.toObservation(e.resource))

      return reports.map((report: any) => 
        FhirMapper.toDiagnosticReport(report, observations)
      )
    } catch (error) {
      logFhirError('Failed to fetch diagnostic reports:', error)
      return []
    }
  }

  async fetchProcedures(patientId: string): Promise<ProcedureEntity[]> {
    try {
      const response = await fhirClient.requestAllPages(
        `Procedure?patient=${patientId}&_count=100&_sort=-date`
      )
      return response.entry?.map((e: any) => FhirMapper.toProcedure(e.resource)) || []
    } catch (error) {
      logFhirError('Failed to fetch procedures:', error)
      return []
    }
  }

  async fetchEncounters(patientId: string): Promise<EncounterEntity[]> {
    try {
      const response = await fhirClient.requestAllPages(
        `Encounter?patient=${patientId}&_sort=-date&_count=100&_include=Encounter:patient&_include=Encounter:location`
      )
      return response.entry?.map((e: any) => FhirMapper.toEncounter(e.resource)) || []
    } catch (error) {
      logFhirError('Failed to fetch encounters:', error)
      return []
    }
  }

  async fetchDocumentReferences(patientId: string): Promise<DocumentReferenceEntity[]> {
    try {
      const response = await fhirClient.requestAllPages(
        `DocumentReference?patient=${patientId}&_sort=-date&_count=100`
      )
      return response.entry?.map((e: any) => FhirMapper.toDocumentReference(e.resource)) || []
    } catch (error) {
      logFhirError('Failed to fetch document references:', error)
      return []
    }
  }

  async fetchCompositions(patientId: string): Promise<CompositionEntity[]> {
    try {
      const response = await fhirClient.requestAllPages(
        `Composition?patient=${patientId}&_sort=-date&_count=100`
      )
      return response.entry?.map((e: any) => FhirMapper.toComposition(e.resource)) || []
    } catch (error) {
      logFhirError('Failed to fetch compositions:', error)
      return []
    }
  }
}
