// Which bridge produced the clinical data. The summary harness describes the
// data and weighs its diagnosis codes differently per source: the NHI cloud
// record (雲端病歷) carries one primary diagnosis per visit and names a
// pharmacy as the requester of a refill, while 健康存摺 keeps primary and
// secondary codes. Read from each resource's own provenance, never guessed
// from content.

export type ClinicalDataSource = 'nhi-medcloud' | 'nhi-health-bank' | 'other'

type ProvenancedResource = {
  meta?: { source?: string; tag?: Array<{ system?: string }> }
}

interface ClinicalDataSourceInput {
  observations?: ProvenancedResource[]
  diagnosticReports?: ProvenancedResource[]
  medications?: ProvenancedResource[]
  encounters?: ProvenancedResource[]
}

const isMedcloud = (resource: ProvenancedResource): boolean =>
  /medcloud2\.nhi\.gov\.tw/.test(resource.meta?.source ?? '') ||
  (resource.meta?.tag ?? []).some((tag) => /cloud-wildcatch\.invalid/.test(tag.system ?? ''))

const isHealthBank = (resource: ProvenancedResource): boolean =>
  /nhi-fhir-bridge/.test(resource.meta?.source ?? '') && !isMedcloud(resource)

/** The bridge behind the data; a chart mixing both NHI bridges, or neither,
 *  is 'other' and gets the neutral description. */
export function detectClinicalDataSource(data: ClinicalDataSourceInput | null | undefined): ClinicalDataSource {
  if (!data) return 'other'
  const resources = [
    ...(data.observations ?? []),
    ...(data.diagnosticReports ?? []),
    ...(data.medications ?? []),
    ...(data.encounters ?? []),
  ]
  const medcloud = resources.some(isMedcloud)
  const healthBank = resources.some(isHealthBank)
  if (medcloud && !healthBank) return 'nhi-medcloud'
  if (healthBank && !medcloud) return 'nhi-health-bank'
  return 'other'
}
