import { filterAiExcludedClinicalDomains } from '@/src/core/utils/ai-clinical-domain-filter.utils'

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
