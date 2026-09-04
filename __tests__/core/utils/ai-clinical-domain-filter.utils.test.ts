import { filterAiExcludedClinicalDomains } from '@/src/core/utils/ai-clinical-domain-filter.utils'
import {
  listClinicalDocuments,
  resolveSelectedDocuments,
} from '@/src/core/utils/clinical-documents.utils'

const ENCOUNTER_KIND_SYSTEM =
  'https://nhi-fhir-bridge.github.io/CodeSystem/encounter-kind'

function encounter(id: string, kind = 'outpatient', extra: Record<string, unknown> = {}) {
  return {
    id,
    status: 'finished',
    type: [{ coding: [{ system: ENCOUNTER_KIND_SYSTEM, code: kind }] }],
    period: { start: '2025-07-30T00:00:00+08:00' },
    ...extra,
  }
}

function procedure(id: string, text: string, encounterId?: string) {
  return {
    id,
    status: 'completed',
    code: { text, coding: [{ display: text }] },
    ...(encounterId ? { encounter: { reference: `Encounter/${encounterId}` } } : {}),
  }
}

describe('filterAiExcludedClinicalDomains', () => {
  it('removes Patient 2-style dental and physical-therapy records without mutating the source', () => {
    const input = {
      encounters: [
        encounter('dental', 'outpatient', {
          serviceType: { coding: [
            { system: 'http://snomed.info/sct', code: '722163006' },
            { system: 'http://terminology.hl7.org/CodeSystem/service-type', code: '88' },
          ] },
        }),
        encounter('rehab-series-1', 'outpatient', {
          reasonCode: [{ text: '未明示側性肩部粘連性囊炎' }],
        }),
        encounter('ordinary'),
      ],
      procedures: [
        procedure('panoramic-xray', '環口全景 X 光片診察', 'dental'),
        procedure('scaling', 'Full mouth scaling for patients at high risk for dental diseases', 'dental'),
        procedure('physical-therapy', '物理治療', 'rehab-series-1'),
        procedure('ordinary-procedure', 'Appendectomy', 'ordinary'),
      ],
    } as any

    const filtered = filterAiExcludedClinicalDomains(input)

    expect(filtered.encounters?.map((record: any) => record.id)).toEqual(['ordinary'])
    expect(filtered.procedures?.map((record: any) => record.id)).toEqual(['ordinary-procedure'])
    expect(input.encounters).toHaveLength(3)
    expect(input.procedures).toHaveLength(4)
  })

  it('removes TCM encounters using standard and bridge codes', () => {
    const input = {
      encounters: [
        encounter('standard-tcm', 'outpatient', {
          serviceType: { coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/service-type',
            code: '13',
          }] },
        }),
        encounter('bridge-tcm', 'tcm-outpatient'),
        encounter('ordinary'),
      ],
      procedures: [],
    } as any

    const filtered = filterAiExcludedClinicalDomains(input)

    expect(filtered.encounters?.map((record: any) => record.id)).toEqual(['ordinary'])
  })

  it('keeps a musculoskeletal visit when there is no rehabilitation evidence', () => {
    const input = {
      encounters: [encounter('shoulder-visit', 'outpatient', {
        reasonCode: [{ coding: [{ code: 'M75.00' }], text: '肩部粘連性囊炎' }],
      })],
      procedures: [],
    } as any

    expect(filterAiExcludedClinicalDomains(input)).toBe(input)
  })

  it('removes standalone dental, rehabilitation, and non-surgical procedures', () => {
    const input = {
      encounters: [],
      procedures: [
        procedure('fluoride', '齲齒高風險患者氟化物治療'),
        procedure('physio', 'Physiotherapy'),
        procedure('ordinary', 'Abdominal ultrasound'),
      ],
    } as any

    const filtered = filterAiExcludedClinicalDomains(input)

    expect(filtered.procedures).toEqual([])
  })

  it('keeps only explicitly surgical procedures for outpatient encounters', () => {
    const input = {
      encounters: [encounter('outpatient-visit')],
      procedures: [
        procedure('wound-care', 'Change dressing- wound care', 'outpatient-visit'),
        procedure('tube-irrigation', 'Tube irrigation', 'outpatient-visit'),
        procedure('ultrasound', 'Abdominal ultrasound', 'outpatient-visit'),
        procedure('appendectomy', 'Appendectomy', 'outpatient-visit'),
        {
          ...procedure(
            'misclassified-dressing',
            '手術、創傷處置及換藥－傷口處置',
            'outpatient-visit',
          ),
          category: {
            coding: [{ system: 'http://snomed.info/sct', code: '387713003' }],
          },
        },
        {
          ...procedure('coded-surgery', 'Untranslated claim item', 'outpatient-visit'),
          category: {
            coding: [{ system: 'http://snomed.info/sct', code: '387713003' }],
          },
        },
      ],
    } as any

    const filtered = filterAiExcludedClinicalDomains(input)

    expect(filtered.procedures?.map((record: any) => record.id)).toEqual([
      'appendectomy',
      'coded-surgery',
    ])
    expect(filtered.encounters?.map((record: any) => record.id)).toEqual(['outpatient-visit'])
  })

  it('removes routine aftercare but retains substantive inpatient and emergency procedures', () => {
    const input = {
      encounters: [
        encounter('inpatient-visit', 'inpatient'),
        encounter('emergency-visit', 'emergency'),
      ],
      procedures: [
        procedure('inpatient-wound-care', 'Change dressing- wound care', 'inpatient-visit'),
        procedure('inpatient-drainage', 'CT-guided drainage of pelvic abscess', 'inpatient-visit'),
        procedure('emergency-treatment', 'Emergency treatment', 'emergency-visit'),
      ],
    } as any

    const filtered = filterAiExcludedClinicalDomains(input)

    expect(filtered.procedures?.map((record: any) => record.id)).toEqual([
      'inpatient-drainage',
      'emergency-treatment',
    ])
  })
})

describe('filterAiExcludedClinicalDomains idempotence', () => {
  const inpatientEncounter = encounter('admission-2018', 'inpatient')
  const inpatientProcedure = procedure('cvc-check', 'Central venous access assessment', 'admission-2018')

  it('keeps an inpatient procedure when a second pass no longer carries its encounter', () => {
    const first = filterAiExcludedClinicalDomains({
      encounters: [inpatientEncounter],
      procedures: [inpatientProcedure],
    } as any)
    expect(first.procedures?.map((record: any) => record.id)).toEqual(['cvc-check'])

    // What the record prioritizer hands the renderer: the procedure survives,
    // its encounter fell outside the encounter time window. Re-deriving the
    // care type from this reduced view would demote it to `other` and exclude
    // a record the reducer deliberately kept.
    const second = filterAiExcludedClinicalDomains({
      encounters: [],
      procedures: first.procedures,
    } as any)

    expect(second.procedures?.map((record: any) => record.id)).toEqual(['cvc-check'])
    const third = filterAiExcludedClinicalDomains({ procedures: second.procedures } as any)
    expect(third.procedures?.map((record: any) => record.id)).toEqual(['cvc-check'])
  })

  it('does not leak the carried care type into serialized clinical data', () => {
    const filtered = filterAiExcludedClinicalDomains({
      encounters: [inpatientEncounter],
      procedures: [inpatientProcedure],
    } as any)
    expect(JSON.parse(JSON.stringify(filtered.procedures![0]))).toEqual(inpatientProcedure)
    expect(Object.keys(filtered.procedures![0])).toEqual(Object.keys(inpatientProcedure))
  })

  it('still excludes an outpatient procedure without surgical evidence on every pass', () => {
    const outpatient = filterAiExcludedClinicalDomains({
      encounters: [encounter('clinic-visit')],
      procedures: [procedure('routine-check', 'Nutrition counselling', 'clinic-visit')],
    } as any)
    expect(outpatient.procedures).toEqual([])
  })
})

describe('filterAiExcludedClinicalDomains discharge grouping evidence', () => {
  const DENTAL_SERVICE_TYPE = {
    coding: [{ system: 'http://terminology.hl7.org/CodeSystem/service-type', code: '88' }],
  }

  function admission(id: string, organization: string, icd: string, serviceType?: unknown) {
    return encounter(id, 'inpatient', {
      serviceProvider: { reference: `Organization/${organization}`, display: organization },
      reasonCode: [{ coding: [{ code: icd }] }],
      ...(serviceType ? { serviceType } : {}),
    })
  }

  function dischargeSummary(id: string, date: string, encounterId: string) {
    return {
      id,
      date,
      type: { coding: [{ code: '18842-5' }] },
      context: { encounter: [{ reference: `Encounter/${encounterId}` }] },
      content: [{ attachment: { contentType: 'text/plain', data: btoa(id) } }],
    }
  }

  // Two admissions at the same institution with the same primary ICD, one of
  // them on an encounter this filter removes. Without carried evidence the
  // renderer loses the grouping key and sends both notes while every AI
  // selector, which resolves documents before the filter, sends only the newest.
  const input = () => ({
    encounters: [
      admission('dental-admission', 'a-hospital', 'N39.0', DENTAL_SERVICE_TYPE),
      admission('western-admission', 'a-hospital', 'N39.0'),
      admission('other-admission', 'b-hospital', 'N39.0'),
    ],
    documentReferences: [
      dischargeSummary('newest-dental', '2026-03-01', 'dental-admission'),
      dischargeSummary('older-western', '2025-03-01', 'western-admission'),
      dischargeSummary('other-org', '2025-01-01', 'other-admission'),
    ],
  }) as any

  it('groups a discharge summary whose encounter the filter removed', () => {
    const source = input()
    const beforeFilter = resolveSelectedDocuments(
      listClinicalDocuments(source), 'deduplicatedAdmissions', [],
    ).map((document) => document.id)
    expect(beforeFilter).toEqual(['newest-dental', 'other-org'])

    const filtered = filterAiExcludedClinicalDomains(source)
    expect(filtered.encounters?.map((record: any) => record.id))
      .toEqual(['western-admission', 'other-admission'])

    const afterFilter = resolveSelectedDocuments(
      listClinicalDocuments(filtered as any), 'deduplicatedAdmissions', [],
    ).map((document) => document.id)
    expect(afterFilter).toEqual(beforeFilter)
  })

  it('carries the key across repeated passes and never serializes it', () => {
    const source = input()
    const once = filterAiExcludedClinicalDomains(source)
    // A later stage may drop more encounters (time window, record-level
    // prioritization). The key resolved here still travels with the document.
    const twice = filterAiExcludedClinicalDomains({
      ...once, encounters: [],
    } as any)
    expect(listClinicalDocuments(twice as any)
      .find((document) => document.id === 'newest-dental')?.dischargeDeduplicationKey)
      .toBe(listClinicalDocuments(source)
        .find((document) => document.id === 'newest-dental')?.dischargeDeduplicationKey)

    const annotated = once.documentReferences!.find((d: any) => d.id === 'newest-dental')!
    const original = source.documentReferences.find((d: any) => d.id === 'newest-dental')
    expect(JSON.parse(JSON.stringify(annotated))).toEqual(original)
    expect(Object.keys(annotated)).toEqual(Object.keys(original))
    // Documents whose encounter survives keep their identity, so the decoded
    // document-text cache is not invalidated by this pass.
    expect(once.documentReferences!.find((d: any) => d.id === 'other-org'))
      .toBe(source.documentReferences.find((d: any) => d.id === 'other-org'))
  })

  it('leaves the raw record view untouched — the domain filter is AI-only', () => {
    const source = input()
    filterAiExcludedClinicalDomains(source)
    expect(source.encounters).toHaveLength(3)
    expect(source.documentReferences.every(
      (document: any) => Object.keys(document).every((key) => !key.startsWith('__')),
    )).toBe(true)
  })
})
