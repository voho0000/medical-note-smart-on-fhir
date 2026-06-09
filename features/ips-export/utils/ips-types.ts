// Minimal FHIR R4 / IPS shapes used by the IPS export builder.
// The project has no @types/fhir dependency, so we keep these intentionally
// small and permissive — just enough to assemble a structurally valid IPS
// document Bundle without fighting the full FHIR type surface.

export interface FhirCoding {
  system?: string
  code?: string
  display?: string
}

export interface FhirCodeableConcept {
  text?: string
  coding?: FhirCoding[]
}

export interface FhirReference {
  reference?: string
  display?: string
}

export interface FhirMeta {
  profile?: string[]
}

/**
 * A FHIR resource. Loosely typed on purpose: each mapper builds the concrete
 * shape it needs. `resourceType` + optional `id` / `meta` are the only fields
 * the builder and validator rely on structurally.
 */
export interface FhirResource {
  resourceType: string
  id?: string
  meta?: FhirMeta
  // Allow arbitrary resource-specific fields.
  [key: string]: unknown
}

export interface IpsNarrative {
  status: 'generated' | 'extensions' | 'additional' | 'empty'
  div: string
}

export interface IpsCompositionSection {
  title: string
  code: FhirCodeableConcept
  text: IpsNarrative
  entry?: FhirReference[]
  /** IPS allows an emptyReason on a section with no entries. */
  emptyReason?: FhirCodeableConcept
}

export interface IpsBundleEntry {
  fullUrl: string
  resource: FhirResource
}

export interface IpsBundle {
  resourceType: 'Bundle'
  type: 'document'
  identifier?: {
    system?: string
    value?: string
  }
  timestamp: string
  entry: IpsBundleEntry[]
}

/**
 * Result of mapping one IPS section: the resources to add to the Bundle and
 * the references the Composition.section.entry should point at. `referencedOnly`
 * resources are added to the Bundle but NOT listed as section entries (e.g. an
 * Observation referenced by a DiagnosticReport, or a Device referenced by a
 * DeviceUseStatement).
 */
export interface SectionMapResult {
  /** Resources that should appear as Composition.section.entry references. */
  entries: IpsBundleEntry[]
  /** Resources added to the Bundle but referenced indirectly, not section-listed. */
  referencedOnly: IpsBundleEntry[]
}
