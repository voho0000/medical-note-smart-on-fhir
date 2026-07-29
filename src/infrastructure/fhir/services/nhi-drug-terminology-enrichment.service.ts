/**
 * App-side NHI drug terminology enrichment.
 *
 * This service intentionally runs after every local input has become a FHIR
 * Bundle, so Health Bank SDK JSON, Health Bank website exports, and any future
 * NHI source share the same terminology policy. The source MedicationRequest
 * remains authoritative: enrichment only adds MedicationKnowledge,
 * supportingInformation links, and Provenance.
 */

import type {
  NhiDrugTerminologyResolutionStatus,
} from '@/vendor/nhi-fhir-bridge-nhi-drug-terminology/src/types'

const NHI_DRUG_CODE_SYSTEM =
  'https://twcore.mohw.gov.tw/CodeSystem/nhi-drug-code'

type FhirResource = Record<string, unknown> & {
  resourceType?: string
  id?: string
}

type BundleEntry = Record<string, unknown> & {
  fullUrl?: string
  resource?: FhirResource
}

interface Candidate {
  entryIndex: number
  resource: FhirResource
  nhiDrugCode: string
  prescriptionDate: string
  lookupKey: string
}

export interface NhiDrugTerminologyEnrichmentReport {
  status: 'not-applicable' | 'enriched' | 'unavailable'
  snapshotId?: string
  medicationRequestCount: number
  eligibleRequestCount: number
  linkedRequestCount: number
  knowledgeResourceCount: number
  atcResolvedCount: number
  skipped: {
    missingNhiDrugCode: number
    ambiguousNhiDrugCode: number
    missingPrescriptionDate: number
  }
  byResolutionStatus: Partial<Record<NhiDrugTerminologyResolutionStatus, number>>
}

export interface NhiDrugTerminologyEnrichmentResult {
  bundle: Record<string, unknown>
  report: NhiDrugTerminologyEnrichmentReport
}

function asEntries(bundle: Record<string, unknown>): BundleEntry[] {
  return Array.isArray(bundle.entry)
    ? bundle.entry.filter(
      (entry): entry is BundleEntry => !!entry && typeof entry === 'object',
    )
    : []
}

function resourceReferenceKeys(entry: BundleEntry): string[] {
  const resource = entry.resource
  if (!resource?.resourceType) return []
  const keys = new Set<string>()
  if (typeof entry.fullUrl === 'string' && entry.fullUrl) keys.add(entry.fullUrl)
  if (typeof resource.id === 'string' && resource.id) {
    keys.add(`${resource.resourceType}/${resource.id}`)
    keys.add(resource.id)
  }
  return [...keys]
}

function referencedMedication(
  request: FhirResource,
  medicationsByReference: Map<string, FhirResource>,
): FhirResource | undefined {
  const reference = (
    request.medicationReference as { reference?: unknown } | undefined
  )?.reference
  if (typeof reference !== 'string' || !reference) return undefined
  return medicationsByReference.get(reference)
    ?? medicationsByReference.get(reference.split('/').pop() ?? '')
}

function medicationCodings(
  request: FhirResource,
  medicationsByReference: Map<string, FhirResource>,
): Array<{ system?: unknown; code?: unknown }> {
  const inline = request.medicationCodeableConcept as {
    coding?: unknown
  } | undefined
  const referenced = referencedMedication(request, medicationsByReference)
  const referencedCode = referenced?.code as { coding?: unknown } | undefined
  const coding = inline?.coding ?? referencedCode?.coding
  return Array.isArray(coding)
    ? coding.filter(
      (item): item is { system?: unknown; code?: unknown } =>
        !!item && typeof item === 'object',
    )
    : []
}

function exactNhiDrugCodes(
  request: FhirResource,
  medicationsByReference: Map<string, FhirResource>,
): string[] {
  return [
    ...new Set(
      medicationCodings(request, medicationsByReference)
        .filter(({ system }) => system === NHI_DRUG_CODE_SYSTEM)
        .map(({ code }) => typeof code === 'string' ? code.trim().toUpperCase() : '')
        .filter(Boolean),
    ),
  ]
}

function prescriptionDate(request: FhirResource): string | null {
  if (typeof request.authoredOn !== 'string') return null
  const date = request.authoredOn.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const parsed = new Date(`${date}T00:00:00Z`)
  return !Number.isNaN(parsed.valueOf())
    && parsed.toISOString().slice(0, 10) === date
    ? date
    : null
}

function notApplicableReport(
  medicationRequestCount: number,
  skipped: NhiDrugTerminologyEnrichmentReport['skipped'],
): NhiDrugTerminologyEnrichmentReport {
  return {
    status: 'not-applicable',
    medicationRequestCount,
    eligibleRequestCount: 0,
    linkedRequestCount: 0,
    knowledgeResourceCount: 0,
    atcResolvedCount: 0,
    skipped,
    byResolutionStatus: {},
  }
}

/**
 * Enrich a local FHIR Bundle without changing any source clinical fields.
 *
 * The 12 MB terminology snapshot is loaded only after an exact NHI drug code
 * and an authoredOn prescription date have both been found. Missing,
 * ambiguous, out-of-range, and conflicting inputs fail closed.
 */
export async function enrichBundleWithNhiDrugTerminology(
  bundle: Record<string, unknown>,
  options: { recordedAt?: string } = {},
): Promise<NhiDrugTerminologyEnrichmentResult> {
  const entries = asEntries(bundle)
  const medicationRequests = entries
    .map((entry, entryIndex) => ({ entry, entryIndex }))
    .filter(({ entry }) => entry.resource?.resourceType === 'MedicationRequest')
  const medicationsByReference = new Map<string, FhirResource>()
  for (const entry of entries) {
    if (entry.resource?.resourceType !== 'Medication') continue
    for (const key of resourceReferenceKeys(entry)) {
      medicationsByReference.set(key, entry.resource)
    }
  }

  const skipped = {
    missingNhiDrugCode: 0,
    ambiguousNhiDrugCode: 0,
    missingPrescriptionDate: 0,
  }
  const candidates: Candidate[] = []
  for (const { entry, entryIndex } of medicationRequests) {
    const resource = entry.resource!
    const codes = exactNhiDrugCodes(resource, medicationsByReference)
    if (codes.length === 0) {
      skipped.missingNhiDrugCode += 1
      continue
    }
    if (codes.length !== 1) {
      skipped.ambiguousNhiDrugCode += 1
      continue
    }
    const date = prescriptionDate(resource)
    if (!date) {
      skipped.missingPrescriptionDate += 1
      continue
    }
    candidates.push({
      entryIndex,
      resource,
      nhiDrugCode: codes[0],
      prescriptionDate: date,
      lookupKey: `${codes[0]}|${date}`,
    })
  }

  if (candidates.length === 0) {
    return {
      bundle,
      report: notApplicableReport(medicationRequests.length, skipped),
    }
  }

  try {
    // Keep this static dynamic import inside the eligible-only branch. Next.js
    // emits the official snapshot as an async chunk instead of adding it to the
    // initial application JavaScript.
    const terminology = await import(
      '@/vendor/nhi-fhir-bridge-nhi-drug-terminology/src/index'
    )
    const uniqueInputs = [
      ...new Map(
        candidates.map((candidate) => [
          candidate.lookupKey,
          {
            nhiDrugCode: candidate.nhiDrugCode,
            prescriptionDate: candidate.prescriptionDate,
          },
        ]),
      ).entries(),
    ]
    const { resolutions } = terminology.resolveManyNhiDrugTerminologies(
      uniqueInputs.map(([, input]) => input),
    )
    const resolutionByKey = new Map(
      uniqueInputs.map(([key], index) => [key, resolutions[index]]),
    )

    const nextEntries = [...entries]
    const knowledgeById = new Map<string, FhirResource>()
    for (const entry of entries) {
      if (
        entry.resource?.resourceType === 'MedicationKnowledge'
        && typeof entry.resource.id === 'string'
      ) {
        knowledgeById.set(entry.resource.id, entry.resource)
      }
    }

    const generatedKnowledge = new Map<string, FhirResource>()
    const linkedKnowledge = new Map<string, FhirResource>()
    const byResolutionStatus:
      Partial<Record<NhiDrugTerminologyResolutionStatus, number>> = {}
    let linkedRequestCount = 0
    let atcResolvedCount = 0

    for (const candidate of candidates) {
      const resolution = resolutionByKey.get(candidate.lookupKey)
      if (!resolution) continue
      byResolutionStatus[resolution.status] =
        (byResolutionStatus[resolution.status] ?? 0) + 1
      if (resolution.status !== 'resolved' || !resolution.record) continue

      const knowledge = terminology.buildMedicationKnowledge(
        resolution.record,
      ) as FhirResource
      if (typeof knowledge.id !== 'string' || !knowledge.id) continue
      const effectiveKnowledge = knowledgeById.get(knowledge.id) ?? knowledge
      if (!knowledgeById.has(knowledge.id)) {
        generatedKnowledge.set(knowledge.id, knowledge)
        knowledgeById.set(knowledge.id, knowledge)
      }
      linkedKnowledge.set(knowledge.id, effectiveKnowledge)
      const linked = terminology.linkMedicationRequestToKnowledge(
        candidate.resource,
        effectiveKnowledge,
      ) as FhirResource
      nextEntries[candidate.entryIndex] = {
        ...nextEntries[candidate.entryIndex],
        resource: linked,
      }
      linkedRequestCount += 1
      if (resolution.record.atcCode) atcResolvedCount += 1
    }

    for (const knowledge of generatedKnowledge.values()) {
      nextEntries.push({
        fullUrl: `urn:uuid:${knowledge.id}`,
        resource: knowledge,
      })
    }

    const recordedAt = options.recordedAt
      ?? (typeof bundle.timestamp === 'string' ? bundle.timestamp : undefined)
      ?? new Date().toISOString()
    const provenance = terminology.buildDrugTerminologyProvenance(
      [...linkedKnowledge.values()],
      recordedAt,
    ) as FhirResource | null
    if (
      provenance
      && typeof provenance.id === 'string'
      && !nextEntries.some(
        (entry) =>
          entry.resource?.resourceType === 'Provenance'
          && entry.resource.id === provenance.id,
      )
    ) {
      nextEntries.push({
        fullUrl: `urn:uuid:${provenance.id}`,
        resource: provenance,
      })
    }

    return {
      bundle: linkedRequestCount > 0
        ? { ...bundle, entry: nextEntries }
        : bundle,
      report: {
        status: linkedRequestCount > 0 ? 'enriched' : 'not-applicable',
        snapshotId: terminology.NHI_DRUG_TERMINOLOGY_MANIFEST.snapshotId,
        medicationRequestCount: medicationRequests.length,
        eligibleRequestCount: candidates.length,
        linkedRequestCount,
        knowledgeResourceCount: generatedKnowledge.size,
        atcResolvedCount,
        skipped,
        byResolutionStatus,
      },
    }
  } catch {
    // Terminology is supplemental. A cached deployment mismatch or unsupported
    // browser must never make the patient's source FHIR impossible to import.
    return {
      bundle,
      report: {
        status: 'unavailable',
        medicationRequestCount: medicationRequests.length,
        eligibleRequestCount: candidates.length,
        linkedRequestCount: 0,
        knowledgeResourceCount: 0,
        atcResolvedCount: 0,
        skipped,
        byResolutionStatus: {},
      },
    }
  }
}
