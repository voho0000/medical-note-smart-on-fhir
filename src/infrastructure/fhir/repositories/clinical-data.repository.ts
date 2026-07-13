// FHIR Clinical Data Repository Implementation
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
  DocumentReferenceEntity,
  CompositionEntity,
  ConsentEntity,
  DeviceEntity,
  CarePlanEntity,
  ClinicalDataCollection,
  ClinicalDataQueryKey,
  ClinicalDataQueryStatus,
} from '@/src/core/entities/clinical-data.entity'
import { fhirClient, LocalBundleModeError } from '../client/fhir-client.service'
import { FhirMapper } from '../mappers/fhir.mapper'
import { FHIR_RESOURCES } from '@/src/shared/constants/fhir-systems.constants'
import {
  classifyFhirQueryError,
  shouldRetryBasicFhirSearch,
  successfulFhirQueryStatus,
} from '../utils/fhir-query-status'

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

type MedicationSourceType = 'MedicationRequest' | 'MedicationStatement'

function medicationReferenceCandidates(reference: string): string[] {
  const withoutHistory = reference.split('/_history/')[0]
  const segments = withoutHistory.split('/').filter(Boolean)
  const id = segments.at(-1)
  return [reference, withoutHistory, id, id ? `Medication/${id}` : undefined]
    .filter((candidate): candidate is string => Boolean(candidate))
}

/**
 * Extract the requested medication resources from a searchset and promote the
 * code from included/contained Medication resources when the choice element is
 * a medicationReference. Keeping this at the repository boundary gives the UI
 * one consistent MedicationEntity shape for both SMART and local bundles.
 */
function mapMedicationSearchResponse(
  response: any,
  sourceType: MedicationSourceType,
): MedicationEntity[] {
  const entries = response.entry || []
  const medicationLookup = new Map<string, any>()

  for (const entry of entries) {
    const resource = entry.resource
    if (resource?.resourceType !== 'Medication') continue
    if (entry.fullUrl) medicationLookup.set(entry.fullUrl, resource)
    if (resource.id) {
      medicationLookup.set(resource.id, resource)
      medicationLookup.set(`Medication/${resource.id}`, resource)
    }
  }

  return entries
    .filter((entry: any) => {
      const resourceType = entry.resource?.resourceType
      // Tolerate resourceType-less fixtures, but never map included Medication
      // resources as medication orders/statements.
      return resourceType === sourceType || !resourceType
    })
    .map((entry: any) => {
      const resource = entry.resource
      const reference = resource.medicationReference?.reference as string | undefined
      let referencedMedication: any

      if (reference?.startsWith('#')) {
        referencedMedication = resource.contained?.find(
          (contained: any) => contained.id === reference.slice(1) && contained.resourceType === 'Medication',
        )
      } else if (reference) {
        for (const candidate of medicationReferenceCandidates(reference)) {
          referencedMedication = medicationLookup.get(candidate)
          if (referencedMedication) break
        }
      }

      return FhirMapper.toMedication({
        ...resource,
        medicationCodeableConcept:
          resource.medicationCodeableConcept ?? referencedMedication?.code,
        _sourceResourceType: sourceType,
      })
    })
}

export class FhirClinicalDataRepository implements IClinicalDataRepository {
  private resourceQueryStatus: Partial<Record<ClinicalDataQueryKey, ClinicalDataQueryStatus>> = {}

  private markQuerySuccess(key: ClinicalDataQueryKey, resourceType: string, count: number) {
    this.resourceQueryStatus[key] = successfulFhirQueryStatus(resourceType, count)
  }

  private markQueryFailure(key: ClinicalDataQueryKey, resourceType: string, error: unknown) {
    this.resourceQueryStatus[key] = classifyFhirQueryError(error, resourceType)
  }

  private async requestWithBasicFallback(primary: string, fallback?: string): Promise<any> {
    try {
      return await fhirClient.requestAllPages(primary)
    } catch (error) {
      if (!fallback || !shouldRetryBasicFhirSearch(error)) throw error
      warnFhirError('FHIR server rejected optional search features; retrying a basic search:', error)
      return fhirClient.requestAllPages(fallback)
    }
  }

  async fetchAllClinicalData(patientId: string): Promise<ClinicalDataCollection> {
    this.resourceQueryStatus = {}
    const [
      conditions,
      medications,
      allergies,
      observations,
      vitalSigns,
      diagnosticReports,
      imagingStudies,
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
      this.fetchImagingStudies(patientId),
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
      imagingStudies,
      procedures,
      encounters,
      documentReferences,
      compositions,
      immunizations,
      consents,
      devices,
      carePlans,
      resourceQueryStatus: { ...this.resourceQueryStatus },
    }
  }

  async fetchConsents(patientId: string): Promise<ConsentEntity[]> {
    try {
      const response = await fhirClient.requestAllPages(
        `Consent?patient=${patientId}&_count=100`
      )
      const result = response.entry?.map((e: any) => FhirMapper.toConsent(e.resource)) || []
      this.markQuerySuccess('Consent', 'Consent', result.length)
      return result
    } catch (error) {
      this.markQueryFailure('Consent', 'Consent', error)
      warnFhirError('Failed to fetch consents:', error)
      return []
    }
  }

  async fetchDevices(patientId: string): Promise<DeviceEntity[]> {
    try {
      const response = await fhirClient.requestAllPages(
        `Device?patient=${patientId}&_count=100`
      )
      const result = response.entry?.map((e: any) => FhirMapper.toDevice(e.resource)) || []
      this.markQuerySuccess('Device', 'Device', result.length)
      return result
    } catch (error) {
      this.markQueryFailure('Device', 'Device', error)
      warnFhirError('Failed to fetch devices:', error)
      return []
    }
  }

  async fetchCarePlans(patientId: string): Promise<CarePlanEntity[]> {
    try {
      const response = await this.requestWithBasicFallback(
        `CarePlan?patient=${patientId}&_sort=-date&_count=100`,
        `CarePlan?patient=${patientId}&_count=100`,
      )
      const result = response.entry?.map((e: any) => FhirMapper.toCarePlan(e.resource)) || []
      this.markQuerySuccess('CarePlan', 'CarePlan', result.length)
      return result
    } catch (error) {
      this.markQueryFailure('CarePlan', 'CarePlan', error)
      warnFhirError('Failed to fetch care plans:', error)
      return []
    }
  }

  async fetchImmunizations(patientId: string): Promise<import('@/src/core/entities/clinical-data.entity').ImmunizationEntity[]> {
    try {
      const response = await this.requestWithBasicFallback(
        `Immunization?patient=${patientId}&_sort=-date&_count=200`,
        `Immunization?patient=${patientId}&_count=200`,
      )
      const result = response.entry?.map((e: any) => FhirMapper.toImmunization(e.resource)) || []
      this.markQuerySuccess('Immunization', 'Immunization', result.length)
      return result
    } catch (error) {
      this.markQueryFailure('Immunization', 'Immunization', error)
      warnFhirError('Failed to fetch immunizations:', error)
      return []
    }
  }

  async fetchConditions(patientId: string): Promise<ConditionEntity[]> {
    try {
      const response = await this.requestWithBasicFallback(
        `Condition?patient=${patientId}&_sort=-recorded-date&_count=100`,
        `Condition?patient=${patientId}&_count=100`,
      )
      const result = response.entry?.map((e: any) => FhirMapper.toCondition(e.resource)) || []
      this.markQuerySuccess('Condition', 'Condition', result.length)
      return result
    } catch (error) {
      this.markQueryFailure('Condition', 'Condition', error)
      logFhirError('Failed to fetch conditions:', error)
      return []
    }
  }

  async fetchMedications(patientId: string): Promise<MedicationEntity[]> {
    const searches: Array<{
      sourceType: MedicationSourceType
      primary: string
      fallback: string
    }> = [
      {
        sourceType: 'MedicationRequest',
        primary: `MedicationRequest?patient=${patientId}&_sort=-authoredon&_count=100&_include=MedicationRequest:medication`,
        fallback: `MedicationRequest?patient=${patientId}&_count=100`,
      },
      {
        sourceType: 'MedicationStatement',
        primary: `MedicationStatement?patient=${patientId}&_count=100&_include=MedicationStatement:medication`,
        fallback: `MedicationStatement?patient=${patientId}&_count=100`,
      },
    ]

    const results = await Promise.allSettled(
      searches.map(async ({ sourceType, primary, fallback }) => {
        const response = await this.requestWithBasicFallback(primary, fallback)
        return mapMedicationSearchResponse(response, sourceType)
      }),
    )

    const medications: MedicationEntity[] = []
    results.forEach((result, index) => {
      const sourceType = searches[index].sourceType
      if (result.status === 'fulfilled') {
        medications.push(...result.value)
        this.markQuerySuccess(sourceType, sourceType, result.value.length)
        return
      }
      this.markQueryFailure(sourceType, sourceType, result.reason)
      const log = sourceType === 'MedicationRequest' ? logFhirError : warnFhirError
      log(`Failed to fetch ${sourceType} resources:`, result.reason)
    })

    return medications
  }

  async fetchAllergies(patientId: string): Promise<AllergyEntity[]> {
    try {
      const response = await fhirClient.requestAllPages(
        `AllergyIntolerance?patient=${patientId}&_count=100`
      )
      const result = response.entry?.map((e: any) => FhirMapper.toAllergy(e.resource)) || []
      this.markQuerySuccess('AllergyIntolerance', 'AllergyIntolerance', result.length)
      return result
    } catch (error) {
      this.markQueryFailure('AllergyIntolerance', 'AllergyIntolerance', error)
      logFhirError('Failed to fetch allergies:', error)
      return []
    }
  }

  async fetchObservations(patientId: string): Promise<ObservationEntity[]> {
    try {
      // Fetch all observations (laboratory, procedure, etc.)
      const response = await this.requestWithBasicFallback(
        `Observation?patient=${patientId}&_count=200&_sort=-date`,
        `Observation?patient=${patientId}&_count=200`,
      )

      const result = response.entry?.map((e: any) => FhirMapper.toObservation(e.resource)) || []
      this.markQuerySuccess('Observation', 'Observation', result.length)
      return result
    } catch (error) {
      this.markQueryFailure('Observation', 'Observation', error)
      logFhirError('Failed to fetch observations:', error)
      return []
    }
  }

  async fetchVitalSigns(patientId: string): Promise<ObservationEntity[]> {
    try {
      const response = await this.requestWithBasicFallback(
        `Observation?patient=${patientId}&category=vital-signs&_sort=-date&_count=200`,
        `Observation?patient=${patientId}&category=vital-signs&_count=200`,
      )
      const result = response.entry?.map((e: any) => FhirMapper.toObservation(e.resource)) || []
      this.markQuerySuccess('Observation:vital-signs', 'Observation', result.length)
      return result
    } catch (error) {
      this.markQueryFailure('Observation:vital-signs', 'Observation', error)
      logFhirError('Failed to fetch vital signs:', error)
      return []
    }
  }

  async fetchDiagnosticReports(patientId: string): Promise<DiagnosticReportEntity[]> {
    try {
      const response = await this.requestWithBasicFallback(
        `DiagnosticReport?patient=${patientId}&_count=500&_sort=-date&_include=DiagnosticReport:result&_include:iterate=Observation:has-member`,
        `DiagnosticReport?patient=${patientId}&_count=500`,
      )

      const entries = response.entry || []
      const reports = entries
        .filter((e: any) => e.resource?.resourceType === FHIR_RESOURCES.DIAGNOSTIC_REPORT)
        .map((e: any) => e.resource)

      const observations = entries
        .filter((e: any) => e.resource?.resourceType === FHIR_RESOURCES.OBSERVATION)
        .map((e: any) => FhirMapper.toObservation(e.resource))

      const result = reports.map((report: any) =>
        FhirMapper.toDiagnosticReport(report, observations)
      )
      this.markQuerySuccess('DiagnosticReport', 'DiagnosticReport', result.length)
      return result
    } catch (error) {
      this.markQueryFailure('DiagnosticReport', 'DiagnosticReport', error)
      logFhirError('Failed to fetch diagnostic reports:', error)
      return []
    }
  }

  async fetchImagingStudies(patientId: string): Promise<ImagingStudyEntity[]> {
    const mapResponse = (response: any): ImagingStudyEntity[] =>
      response.entry
        ?.filter((e: any) => e.resource?.resourceType === FHIR_RESOURCES.IMAGING_STUDY)
        .map((e: any) => FhirMapper.toImagingStudy(e.resource)) || []

    try {
      const response = await this.requestWithBasicFallback(
        `ImagingStudy?patient=${patientId}&_count=200&_sort=-started`,
        `ImagingStudy?patient=${patientId}&_count=200`,
      )
      const result = mapResponse(response)
      this.markQuerySuccess('ImagingStudy', 'ImagingStudy', result.length)
      return result
    } catch (error) {
      this.markQueryFailure('ImagingStudy', 'ImagingStudy', error)
      // ImagingStudy is optional on many R4 servers. Keep the rest of the chart
      // usable, while resourceQueryStatus tells the UI why this list is empty.
      warnFhirError('Failed to fetch imaging studies:', error)
      return []
    }
  }

  async fetchProcedures(patientId: string): Promise<ProcedureEntity[]> {
    try {
      const response = await this.requestWithBasicFallback(
        `Procedure?patient=${patientId}&_count=100&_sort=-date`,
        `Procedure?patient=${patientId}&_count=100`,
      )
      const result = response.entry?.map((e: any) => FhirMapper.toProcedure(e.resource)) || []
      this.markQuerySuccess('Procedure', 'Procedure', result.length)
      return result
    } catch (error) {
      this.markQueryFailure('Procedure', 'Procedure', error)
      logFhirError('Failed to fetch procedures:', error)
      return []
    }
  }

  async fetchEncounters(patientId: string): Promise<EncounterEntity[]> {
    try {
      const response = await this.requestWithBasicFallback(
        `Encounter?patient=${patientId}&_sort=-date&_count=100&_include=Encounter:patient&_include=Encounter:location`,
        `Encounter?patient=${patientId}&_count=100`,
      )
      // _include puts Patient/Location entries in the same bundle — map only
      // actual Encounters (same guard as fetchDiagnosticReports).
      const result = (
        response.entry
          ?.filter((e: any) => e.resource?.resourceType === FHIR_RESOURCES.ENCOUNTER)
          .map((e: any) => FhirMapper.toEncounter(e.resource)) || []
      )
      this.markQuerySuccess('Encounter', 'Encounter', result.length)
      return result
    } catch (error) {
      this.markQueryFailure('Encounter', 'Encounter', error)
      logFhirError('Failed to fetch encounters:', error)
      return []
    }
  }

  async fetchDocumentReferences(patientId: string): Promise<DocumentReferenceEntity[]> {
    try {
      const response = await this.requestWithBasicFallback(
        `DocumentReference?patient=${patientId}&_sort=-date&_count=100`,
        `DocumentReference?patient=${patientId}&_count=100`,
      )
      const result = response.entry?.map((e: any) => FhirMapper.toDocumentReference(e.resource)) || []
      this.markQuerySuccess('DocumentReference', 'DocumentReference', result.length)
      return result
    } catch (error) {
      this.markQueryFailure('DocumentReference', 'DocumentReference', error)
      logFhirError('Failed to fetch document references:', error)
      return []
    }
  }

  async fetchCompositions(patientId: string): Promise<CompositionEntity[]> {
    try {
      const response = await this.requestWithBasicFallback(
        `Composition?patient=${patientId}&_sort=-date&_count=100`,
        `Composition?patient=${patientId}&_count=100`,
      )
      const result = response.entry?.map((e: any) => FhirMapper.toComposition(e.resource)) || []
      this.markQuerySuccess('Composition', 'Composition', result.length)
      return result
    } catch (error) {
      this.markQueryFailure('Composition', 'Composition', error)
      logFhirError('Failed to fetch compositions:', error)
      return []
    }
  }
}
