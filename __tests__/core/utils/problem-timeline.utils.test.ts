import {
  buildProblemTimelineLines,
  buildProblemTimelineSection,
  PROBLEM_TIMELINE_SECTION_TITLE,
} from '@/src/core/utils/problem-timeline.utils'

function encounter(overrides: Record<string, any>) {
  return {
    id: 'enc',
    status: 'finished',
    class: { code: 'AMB' },
    period: { start: '2024-01-01' },
    serviceProvider: { display: '合成測試醫院' },
    ...overrides,
  }
}

function reason(code: string, display: string) {
  return { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code, display }] }
}

function problemListCondition(overrides: Record<string, any>) {
  return {
    id: 'cond',
    category: [{ coding: [{ code: 'problem-list-item' }] }],
    clinicalStatus: { coding: [{ code: 'active' }] },
    verificationStatus: { coding: [{ code: 'confirmed' }] },
    ...overrides,
  }
}

const options = { locale: 'en' }

describe('problem timeline grouping', () => {
  it('collapses one ICD-10 family onto a single line labelled with the most specific code', () => {
    const { lines } = buildProblemTimelineLines({
      encounters: [
        encounter({ id: 'e1', period: { start: '2021-03-02' }, reasonCode: [reason('E11.9', 'Type 2 diabetes')] }),
        encounter({ id: 'e2', period: { start: '2023-08-11' }, reasonCode: [reason('E11.65', 'Type 2 diabetes with hyperglycemia')] }),
      ],
    }, options)

    expect(lines).toHaveLength(1)
    expect(lines[0].family).toBe('E11')
    expect(lines[0].code).toBe('E11.65')
    expect(lines[0].label).toBe('E11.65 - Type 2 diabetes with hyperglycemia')
  })

  it('counts one visit once even when a Condition and the visit reason repeat the code', () => {
    const { lines } = buildProblemTimelineLines({
      conditions: [problemListCondition({
        id: 'c1',
        code: { text: 'Heart failure', coding: [{ system: 'icd-10-cm', code: 'I50.9', display: 'Heart failure' }] },
        recordedDate: '2024-02-02',
        encounter: { reference: 'Encounter/e1' },
      })],
      encounters: [encounter({ id: 'e1', period: { start: '2024-02-02' }, reasonCode: [reason('I50.9', 'Heart failure')] })],
    }, options)

    expect(lines).toHaveLength(1)
    expect(lines[0].encounters).toBe(1)
  })

  it('reports first/last seen, encounter and inpatient counts, departments and institutions', () => {
    const { lines } = buildProblemTimelineLines({
      encounters: [
        encounter({
          id: 'e1',
          period: { start: '2019-05-04' },
          reasonCode: [reason('N18.4', 'CKD stage 4')],
          serviceType: { text: 'Nephrology' },
          serviceProvider: { display: 'Hospital A' },
        }),
        encounter({
          id: 'e2',
          class: { code: 'IMP' },
          period: { start: '2022-06-06' },
          reasonCode: [reason('N18.5', 'CKD stage 5')],
          serviceType: { text: 'Nephrology' },
          serviceProvider: { display: 'Hospital A' },
        }),
        encounter({
          id: 'e3',
          period: { start: '2025-09-09' },
          reasonCode: [reason('N18.4', 'CKD stage 4')],
          serviceType: { text: 'Internal Medicine' },
          serviceProvider: { display: 'Hospital B' },
        }),
      ],
    }, options)

    const [line] = lines
    expect(line.firstSeen).toBe('2019-05-04')
    expect(line.lastSeen).toBe('2025-09-09')
    expect(line.encounters).toBe(3)
    expect(line.inpatientEncounters).toBe(1)
    expect(line.departments).toEqual(['Nephrology', 'Internal Medicine'])
    expect(line.institutions).toEqual(['Hospital A', 'Hospital B'])
    expect(line.text).toContain('2019-05-04 → 2025-09-09')
    expect(line.text).toContain('3 visits (1 inpatient)')
  })

  it('omits department and institution gracefully when the records do not expose them', () => {
    const { lines } = buildProblemTimelineLines({
      encounters: [encounter({ id: 'e1', serviceProvider: undefined, reasonCode: [reason('J45.909', 'Asthma')] })],
    }, options)

    expect(lines[0].departments).toEqual([])
    expect(lines[0].institutions).toEqual([])
    expect(lines[0].text).toBe('J45.909 - Asthma | 2024-01-01 | 1 visits')
  })

  it('ignores free-text visit reasons that are not coded diagnoses', () => {
    const { lines } = buildProblemTimelineLines({
      encounters: [
        encounter({ id: 'e1', reasonCode: [{ text: 'Routine oncology follow-up and symptom review' }] }),
        encounter({ id: 'e2', reasonCode: [reason('C50.919', 'Breast carcinoma')] }),
      ],
    }, options)

    expect(lines.map((line) => line.code)).toEqual(['C50.919'])
  })

  it('drops a refuted Condition entirely', () => {
    const { lines } = buildProblemTimelineLines({
      conditions: [problemListCondition({
        id: 'c1',
        verificationStatus: { coding: [{ code: 'refuted' }] },
        code: { text: 'Lupus', coding: [{ system: 'icd-10-cm', code: 'M32.9', display: 'Lupus' }] },
        recordedDate: '2024-01-01',
      })],
    }, options)

    expect(lines).toEqual([])
  })
})

describe('problem timeline sorting and capping', () => {
  const inactive = (index: number, lastSeen: string) => encounter({
    id: `e${index}`,
    period: { start: lastSeen },
    reasonCode: [reason(`K${String(index).padStart(2, '0')}.1`, `Problem ${index}`)],
  })

  it('sorts active problems first, then by last seen descending', () => {
    const { lines } = buildProblemTimelineLines({
      conditions: [problemListCondition({
        id: 'c1',
        code: { text: 'Breast carcinoma', coding: [{ system: 'icd-10-cm', code: 'C50.919', display: 'Breast carcinoma' }] },
        recordedDate: '2018-01-01',
      })],
      encounters: [inactive(11, '2026-01-01'), inactive(12, '2020-01-01')],
    }, options)

    expect(lines.map((line) => line.code)).toEqual(['C50.919', 'K11.1', 'K12.1'])
  })

  it('caps the rendered lines and never cuts an active or inpatient problem', () => {
    const encounters = Array.from({ length: 30 }, (_, index) =>
      encounter({
        id: `e${index}`,
        period: { start: `20${String(10 + index).padStart(2, '0')}-01-01` },
        reasonCode: [reason(`K${String(index).padStart(2, '0')}.1`, `Problem ${index}`)],
      }))
    // The oldest problem is the first the cap would drop — but it put the
    // patient in a bed, so it has to survive.
    encounters[0] = { ...encounters[0], class: { code: 'IMP' } }

    const { lines, omitted } = buildProblemTimelineLines({
      conditions: [problemListCondition({
        id: 'c1',
        code: { text: 'Breast carcinoma', coding: [{ system: 'icd-10-cm', code: 'C50.919', display: 'Breast carcinoma' }] },
        recordedDate: '2018-01-01',
      })],
      encounters,
    }, { ...options, lineCap: 5 })

    expect(lines).toHaveLength(5)
    expect(omitted).toBe(26)
    expect(lines.some((line) => line.code === 'C50.919' && line.active)).toBe(true)
    expect(lines.some((line) => line.code === 'K00.1' && line.inpatientEncounters === 1)).toBe(true)
  })

  it('keeps every protected line even when they alone exceed the cap', () => {
    const encounters = Array.from({ length: 6 }, (_, index) =>
      encounter({
        id: `e${index}`,
        class: { code: 'IMP' },
        period: { start: `202${index}-01-01` },
        reasonCode: [reason(`K${String(index).padStart(2, '0')}.1`, `Problem ${index}`)],
      }))

    const { lines, omitted } = buildProblemTimelineLines({ encounters }, { ...options, lineCap: 2 })

    expect(lines).toHaveLength(6)
    expect(omitted).toBe(0)
  })

  it('names the omission in the rendered section footer', () => {
    const encounters = Array.from({ length: 4 }, (_, index) =>
      encounter({
        id: `e${index}`,
        period: { start: `202${index}-01-01` },
        reasonCode: [reason(`K${String(index).padStart(2, '0')}.1`, `Problem ${index}`)],
      }))

    const section = buildProblemTimelineSection({ encounters }, { ...options, lineCap: 2 })

    expect(section!.title).toBe(PROBLEM_TIMELINE_SECTION_TITLE)
    expect(section!.items).toHaveLength(3)
    expect(section!.items.at(-1)).toContain('+2 more (older/less frequent')
    expect(section!.items.at(-1)).toContain('inpatient stay is listed above')
  })

  it('returns null when no coded problem exists', () => {
    expect(buildProblemTimelineSection({ encounters: [encounter({ reasonCode: [] })] }, options)).toBeNull()
    expect(buildProblemTimelineSection({}, options)).toBeNull()
  })
})

describe('problem timeline citation resolution', () => {
  it('prints the latest catalog-eligible Condition as the resource type + date + display anchor', () => {
    const conditions = [
      problemListCondition({
        id: 'c1',
        code: { text: 'Breast carcinoma', coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: 'C50.911', display: 'Breast carcinoma' }] },
        recordedDate: '2018-04-01',
      }),
      problemListCondition({
        id: 'c2',
        code: { text: 'Breast carcinoma with metastatic recurrence', coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: 'C50.919', display: 'Breast carcinoma with metastatic recurrence' }] },
        recordedDate: '2024-05-06',
      }),
    ]

    const { lines } = buildProblemTimelineLines({ conditions }, options)
    const [line] = lines

    // The catalog row for C50.919 is `Condition | 2024-05-06 | Breast
    // carcinoma with metastatic recurrence`; every part of it is on the line.
    expect(line.conditionAnchor).toEqual({ date: '2024-05-06', display: 'Breast carcinoma with metastatic recurrence' })
    expect(line.label).toContain('Breast carcinoma with metastatic recurrence')
    expect(line.text).toContain('Condition 2024-05-06')
  })

  it('does not print an anchor for an encounter-diagnosis Condition, which never reaches the source catalog', () => {
    const { lines } = buildProblemTimelineLines({
      conditions: [{
        id: 'claim-1-condition-1',
        category: [{ coding: [{ code: 'encounter-diagnosis' }] }],
        clinicalStatus: { coding: [{ code: 'active' }] },
        code: { text: 'Gastritis', coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: 'K29.70', display: 'Gastritis' }] },
        recordedDate: '2025-02-02',
        encounter: { reference: 'Encounter/e1' },
      }],
      encounters: [encounter({ id: 'e1', period: { start: '2025-02-02' } })],
    }, options)

    expect(lines).toHaveLength(1)
    expect(lines[0].conditionAnchor).toBeUndefined()
    expect(lines[0].text).not.toContain('Condition ')
  })

  it('attributes a Condition to the visit that names it through Encounter.diagnosis', () => {
    const { lines } = buildProblemTimelineLines({
      conditions: [problemListCondition({
        id: 'c1',
        code: { text: 'Neutropenia with fever', coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: 'D70.9', display: 'Neutropenia with fever' }] },
        recordedDate: '2020-01-01',
      })],
      encounters: [encounter({
        id: 'e1',
        class: { code: 'IMP' },
        period: { start: '2020-01-01' },
        diagnosis: [{ condition: { reference: 'Condition/c1' }, rank: 1 }],
      })],
    }, options)

    expect(lines[0].inpatientEncounters).toBe(1)
    expect(lines[0].institutions).toEqual(['合成測試醫院'])
  })
})
