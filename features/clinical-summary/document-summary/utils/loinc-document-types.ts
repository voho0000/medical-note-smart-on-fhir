// loinc-document-types.ts
// LOINC code → i18n key mapping for FHIR Composition document types and the
// section codes used by IPS / discharge summaries. Used by DocumentSummaryCard
// to pick a human-readable label without baking translations into the resource.
//
// Keep the lists narrow and intentional — only codes the app is likely to
// see from health-record imports (IPS, NHI discharge summaries). Anything
// not in the table falls back to the source's own `composition.title` or
// `section.title`, which is the correct behaviour: never invent a label.

/**
 * LOINC codes for the OVERALL Composition.type (i.e. the document type).
 * Maps each code to an i18n key under `documentSummary.docTypes` (resolved by
 * the card with a string fallback).
 */
export const DOCUMENT_TYPE_LOINC: Record<string, string> = {
  // International Patient Summary
  '60591-5': 'ipsPatientSummary',
  // Hospital discharge summary
  '18842-5': 'dischargeSummary',
  // Consult note
  '11488-4': 'consultNote',
  // Subsequent evaluation note (progress note)
  '11506-3': 'progressNote',
  // History and physical note
  '34117-2': 'historyAndPhysical',
  // Summary of episode note
  '34133-9': 'episodeSummary',
  // Procedure note
  '28570-0': 'procedureNote',
  // Laboratory report
  '11502-2': 'labReport',
  // Diagnostic imaging report
  '18748-4': 'imagingReport',
  // Referral note
  '57133-1': 'referralNote',
}

/**
 * LOINC codes for IPS Composition.section[].code — the standardised section
 * identifiers defined by the IPS implementation guide. Falling back to the
 * source's own section.title is fine when a code isn't recognised.
 */
export const SECTION_LOINC: Record<string, string> = {
  '11450-4': 'problemList',
  '10160-0': 'medicationSummary',
  '48765-2': 'allergiesAndIntolerances',
  '47519-4': 'historyOfProcedures',
  '11369-6': 'historyOfImmunizations',
  '46264-8': 'medicalDevices',
  '30954-2': 'diagnosticResults',
  '18776-5': 'planOfCare',
  '42348-3': 'advanceDirectives',
  '8716-3':  'vitalSigns',
  '10162-6': 'pregnancyHistory',
  '29762-2': 'socialHistory',
  '47420-5': 'functionalStatus',
  '10157-6': 'familyHistory',
  '11348-0': 'pastIllnessHistory',
  // Discharge-summary-specific sections (LOINC) — included now so when the
  // bridge starts shipping 18842-5 documents the labels work out of the box.
  '8648-8':  'hospitalCourse',
  '10183-2': 'dischargeMedications',
  '10184-0': 'dischargeInstructions',
  '8653-8':  'reasonForReferral',
  '46240-8': 'historyOfEncounters',
  '42349-1': 'reasonForVisit',
}

/**
 * IPS Composition profile URL (R4). Used to flag a document with the "IPS"
 * badge even when type.coding is missing or unusual.
 */
export const IPS_COMPOSITION_PROFILE =
  'http://hl7.org/fhir/uv/ips/StructureDefinition/Composition-uv-ips'

/**
 * Heuristic: does this Composition look like an IPS document?
 * Either the LOINC type code is 60591-5, or the meta.profile array contains
 * the IPS Composition profile URL.
 */
export function isIpsComposition(composition: any): boolean {
  const codings: any[] = composition?.type?.coding ?? []
  if (codings.some((c) => c?.code === '60591-5')) return true
  const profiles: string[] = composition?.meta?.profile ?? []
  return profiles.some((p) => typeof p === 'string' && p.includes('Composition-uv-ips'))
}

/**
 * Returns the LOINC code of the Composition.type (first coding that has one)
 * or null. Used as the lookup key for DOCUMENT_TYPE_LOINC.
 */
export function getDocumentTypeCode(composition: any): string | null {
  const codings: any[] = composition?.type?.coding ?? []
  for (const c of codings) {
    if (c?.code) return c.code
  }
  return null
}

/**
 * Returns the LOINC code of a section.code (first coding that has one) or
 * null. Used as the lookup key for SECTION_LOINC.
 */
export function getSectionCode(section: any): string | null {
  const codings: any[] = section?.code?.coding ?? []
  for (const c of codings) {
    if (c?.code) return c.code
  }
  return null
}
