import { buildIpsBundle } from '@/features/ips-export/utils/ips-builder'
import { validateIpsBundle } from '@/features/ips-export/utils/ips-lite-validator'
import { SECTION_EMPTY_REASON } from '@/features/ips-export/utils/ips-constants'
import type { IpsBundle, IpsCompositionSection } from '@/features/ips-export/utils/ips-types'
import type { ClinicalDataCollection } from '@/src/core/entities/clinical-data.entity'

function emptyCollection(): ClinicalDataCollection {
  return {
    conditions: [],
    medications: [],
    allergies: [],
    observations: [],
    vitalSigns: [],
    diagnosticReports: [],
    imagingStudies: [],
    procedures: [],
    encounters: [],
    documentReferences: [],
    compositions: [],
    immunizations: [],
    consents: [],
    devices: [],
    carePlans: [],
  }
}

function freshBundle(): IpsBundle {
  return buildIpsBundle({ patient: null, data: emptyCollection() })
}

function sections(bundle: IpsBundle): IpsCompositionSection[] {
  return (bundle.entry[0].resource.section as IpsCompositionSection[]) ?? []
}

function itemById(bundle: IpsBundle, id: string) {
  return validateIpsBundle(bundle).items.find((i) => i.id === id)
}

describe('validateIpsBundle — section.code + ips-comp-1 invariants', () => {
  it('passes on a builder-produced document (empty required sections use emptyReason)', () => {
    const bundle = freshBundle()
    const result = validateIpsBundle(bundle)
    expect(result.ok).toBe(true)
    expect(itemById(bundle, 'section-code')?.ok).toBe(true)
    expect(itemById(bundle, 'section-entry-or-empty')?.ok).toBe(true)
    // Builder emits the IPS 2.0 list-empty-reason coding on empty required sections.
    for (const s of sections(bundle)) {
      expect(s.emptyReason?.coding?.[0]).toEqual({ ...SECTION_EMPTY_REASON })
    }
  })

  it('fails ips-comp-1 when a section has NEITHER entries NOR an emptyReason', () => {
    const bundle = freshBundle()
    delete sections(bundle)[0].emptyReason
    expect(itemById(bundle, 'section-entry-or-empty')?.ok).toBe(false)
    expect(validateIpsBundle(bundle).ok).toBe(false)
  })

  it('fails ips-comp-1 when a section has BOTH entries AND an emptyReason', () => {
    const bundle = freshBundle()
    const s = sections(bundle)[0]
    s.entry = [{ reference: bundle.entry[1].fullUrl }] // point at the Patient entry (resolves)
    // emptyReason still present from the empty build → both set.
    expect(itemById(bundle, 'section-entry-or-empty')?.ok).toBe(false)
  })

  it('fails when a section is missing a coded section.code', () => {
    const bundle = freshBundle()
    const s = sections(bundle)[0]
    ;(s as { code?: unknown }).code = undefined
    expect(itemById(bundle, 'section-code')?.ok).toBe(false)
    expect(validateIpsBundle(bundle).ok).toBe(false)
  })
})
