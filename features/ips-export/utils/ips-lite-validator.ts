// IPS lite validator — cheap structural sanity checks surfaced in the preview.
//
// This is NOT a substitute for the official HL7 IPS IG validator. It catches the
// gross structural mistakes (wrong Bundle type, missing required sections,
// dangling references, missing profiles) so obvious regressions are visible in
// the UI before the user runs the document through the real validator.

import type { FhirResource, IpsBundle } from './ips-types'
import { COMPOSITION_TYPE_LOINC, IPS_PROFILES, IPS_SECTION } from './ips-constants'

export interface ValidationItem {
  id: string
  label: string
  ok: boolean
  /** Optional detail shown when the check fails. */
  detail?: string
}

export interface ValidationResult {
  ok: boolean
  items: ValidationItem[]
}

function getComposition(bundle: IpsBundle): FhirResource | undefined {
  const first = bundle.entry?.[0]?.resource
  return first?.resourceType === 'Composition' ? first : undefined
}

interface CompositionSection {
  title?: string
  code?: { coding?: Array<{ code?: string }> }
  entry?: Array<{ reference?: string }>
  emptyReason?: { coding?: Array<{ system?: string; code?: string }> }
}

function sectionLoincCodes(composition: FhirResource | undefined): Set<string> {
  const sections = (composition?.section as CompositionSection[] | undefined) ?? []
  const codes = new Set<string>()
  for (const s of sections) {
    for (const c of s.code?.coding ?? []) {
      if (c.code) codes.add(c.code)
    }
  }
  return codes
}

export function validateIpsBundle(bundle: IpsBundle): ValidationResult {
  const items: ValidationItem[] = []
  const add = (id: string, label: string, ok: boolean, detail?: string) =>
    items.push({ id, label, ok, ...(detail ? { detail } : {}) })

  // 1. Bundle.type === document
  add('bundle-type', 'Bundle.type is "document"', bundle?.type === 'document', `got "${bundle?.type}"`)

  // 2. First entry is a Composition with the IPS profile + type
  const composition = getComposition(bundle)
  add('composition-first', 'First entry is a Composition', !!composition)
  add(
    'composition-type',
    'Composition.type is 60591-5 (Patient summary)',
    ((composition?.type as { coding?: Array<{ code?: string }> } | undefined)?.coding ?? []).some(
      (c) => c.code === COMPOSITION_TYPE_LOINC,
    ),
  )
  add(
    'composition-profile',
    'Composition carries the IPS profile',
    (composition?.meta?.profile ?? []).includes(IPS_PROFILES.composition),
  )

  // 3. Composition.subject + author + date present
  add('composition-subject', 'Composition.subject is set', !!(composition?.subject as { reference?: string } | undefined)?.reference)
  add('composition-author', 'Composition.author is set', Array.isArray(composition?.author) && (composition!.author as unknown[]).length > 0)
  add('composition-date', 'Composition.date is set', !!composition?.date)

  // 4. Three required sections present
  const codes = sectionLoincCodes(composition)
  add('section-problems', 'Problem List section present', codes.has(IPS_SECTION.problemList.loinc))
  add('section-allergies', 'Allergies section present', codes.has(IPS_SECTION.allergies.loinc))
  add('section-medications', 'Medication section present', codes.has(IPS_SECTION.medications.loinc))

  // 5. Every section carries a code, and (ips-comp-1) has EITHER entries OR an
  //    emptyReason — never neither, never both.
  const sections = (composition?.section as CompositionSection[] | undefined) ?? []
  const sectionName = (s: CompositionSection, i: number) =>
    s.title || s.code?.coding?.[0]?.code || `#${i + 1}`
  const missingCode = sections
    .filter((s) => !(s.code?.coding ?? []).some((c) => c.code))
    .map(sectionName)
  add('section-code', 'Every section carries a coded section.code', missingCode.length === 0, missingCode.slice(0, 3).join(', '))
  const badEmptiness = sections
    .filter((s) => {
      const hasEntries = (s.entry?.length ?? 0) > 0
      const hasEmptyReason = !!s.emptyReason
      return hasEntries === hasEmptyReason // neither, or both
    })
    .map(sectionName)
  add(
    'section-entry-or-empty',
    'Every section has entries or an emptyReason (ips-comp-1)',
    badEmptiness.length === 0,
    badEmptiness.slice(0, 3).join(', '),
  )

  // 6. Every section.entry reference resolves to a Bundle entry
  const fullUrls = new Set((bundle.entry ?? []).map((e) => e.fullUrl))
  const dangling: string[] = []
  for (const s of sections) {
    for (const e of s.entry ?? []) {
      if (e.reference && !fullUrls.has(e.reference)) dangling.push(e.reference)
    }
  }
  add('refs-resolve', 'All section references resolve', dangling.length === 0, dangling.slice(0, 3).join(', '))

  // 7. Every resource has a non-empty meta.profile
  const missingProfile = (bundle.entry ?? [])
    .filter((e) => !(e.resource?.meta?.profile?.length))
    .map((e) => e.resource?.resourceType ?? 'unknown')
  add('meta-profile', 'Every resource declares meta.profile', missingProfile.length === 0, missingProfile.slice(0, 5).join(', '))

  return { ok: items.every((i) => i.ok), items }
}
