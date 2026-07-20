import { buildLabPivots } from '@/features/clinical-summary/reports/hooks/useLabPivot'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { pruneCrossLinkedLabDuplicates } = require('../../scripts/demo-lab-dedupe.cjs') as {
  pruneCrossLinkedLabDuplicates: (resources: any[]) => { removedIds: string[] }
}

const LOINC = 'http://loinc.org'
const NHI = 'https://twcore.mohw.gov.tw/CodeSystem/nhi-medical-order-code'

function observation(id: string, loinc: string, nhi: string, value: number, unit: string) {
  return {
    resourceType: 'Observation',
    id,
    status: 'final',
    subject: { reference: 'Patient/p1' },
    encounter: { reference: 'Encounter/e1' },
    effectiveDateTime: '2025-05-19T00:00:00+08:00',
    performer: [{ display: '示範長青醫院' }],
    specimen: { display: 'Blood' },
    code: { coding: [{ system: LOINC, code: loinc }, { system: NHI, code: nhi }] },
    valueQuantity: { value, unit, code: unit, system: 'http://unitsofmeasure.org' },
    referenceRange: [{ low: { value: 1, unit }, high: { value: 99, unit } }],
    interpretation: [{ coding: [{ code: 'L' }] }],
  }
}

function report(id: string, loinc: string, nhi: string, resultIds: string[]) {
  return {
    resourceType: 'DiagnosticReport',
    id,
    code: { coding: [{ system: LOINC, code: loinc }, { system: NHI, code: nhi }] },
    result: resultIds.map((resultId) => ({ reference: `Observation/${resultId}` })),
  }
}

describe('demo lab cross-link dedupe', () => {
  it('keeps only the copy whose NHI and LOINC both match its parent report', () => {
    const resources = [
      report('hb-report', '718-7', '08003C', ['hb-right', 'hct-wrong']),
      report('hct-report', '4544-3', '08004C', ['hb-wrong', 'hct-right']),
      observation('hb-right', '718-7', '08003C', 12.7, 'g/dL'),
      observation('hct-wrong', '4544-3', '08003C', 40.5, '%'),
      observation('hb-wrong', '718-7', '08004C', 12.7, 'g/dL'),
      observation('hct-right', '4544-3', '08004C', 40.5, '%'),
    ]

    const result = pruneCrossLinkedLabDuplicates(resources)

    expect(result.removedIds).toEqual(['hb-wrong', 'hct-wrong'])
    expect(resources.filter((resource) => resource.resourceType === 'Observation').map((resource) => resource.id)).toEqual([
      'hb-right',
      'hct-right',
    ])
    const hbReport = resources.find((resource) => resource.id === 'hb-report') as ReturnType<typeof report>
    const hctReport = resources.find((resource) => resource.id === 'hct-report') as ReturnType<typeof report>
    expect(hbReport.result).toEqual([{ reference: 'Observation/hb-right' }])
    expect(hctReport.result).toEqual([{ reference: 'Observation/hct-right' }])
  })

  it('does not remove equal results when both are correctly attached', () => {
    const resources = [
      report('hb-report-a', '718-7', '08003C', ['hb-a']),
      report('hb-report-b', '718-7', '08005C', ['hb-b']),
      observation('hb-a', '718-7', '08003C', 12.7, 'g/dL'),
      observation('hb-b', '718-7', '08005C', 12.7, 'g/dL'),
    ]

    expect(pruneCrossLinkedLabDuplicates(resources).removedIds).toEqual([])
    expect(resources.filter((resource) => resource.resourceType === 'Observation')).toHaveLength(2)
  })

  it('keeps the checked-in demo bundle free of the 2025-05-19 cross-links', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const bundle = require('../../public/demo/demo-bundle.json') as { entry: Array<{ resource: any }> }
    const resources = bundle.entry.map((entry) => entry.resource)
    const coding = (resource: any, systemPart: string) =>
      resource.code?.coding?.find((candidate: any) => String(candidate.system || '').includes(systemPart))?.code
    const reportsOnDate = resources.filter((resource) =>
      resource.resourceType === 'DiagnosticReport' &&
      resource.effectiveDateTime?.startsWith('2025-05-19'))
    const hbReport = reportsOnDate.find((resource) => coding(resource, 'nhi-medical-order-code') === '08003C')
    const hctReport = reportsOnDate.find((resource) => coding(resource, 'nhi-medical-order-code') === '08004C')
    const observations = resources.filter((resource) => resource.resourceType === 'Observation')
    const observationsById = new Map(observations.map((observation) => [observation.id, observation]))
    const reportMembers = (report: any) => (report?.result || []).map((result: any) =>
      observationsById.get(String(result.reference || '').split('/').pop()))

    expect(reportMembers(hbReport)).toHaveLength(1)
    expect(reportMembers(hbReport)[0]).toMatchObject({ valueQuantity: { value: 12.7, unit: 'g/dL' } })
    expect(coding(reportMembers(hbReport)[0], 'loinc.org')).toBe('718-7')
    expect(reportMembers(hctReport)).toHaveLength(1)
    expect(reportMembers(hctReport)[0]).toMatchObject({ valueQuantity: { value: 40.5, unit: '%' } })
    expect(coding(reportMembers(hctReport)[0], 'loinc.org')).toBe('4544-3')

    const cbc = buildLabPivots(observations).cbc
    const hbCell = cbc.rows.find((row) => row.testKey === 'HB')?.values.get('2025-05-19')
    const hctCell = cbc.rows.find((row) => row.testKey === 'HCT')?.values.get('2025-05-19')
    expect(hbCell).toMatchObject({ value: '12.7', unit: 'g/dL' })
    expect(hctCell).toMatchObject({ value: '40.5', unit: '%' })
    expect(hbCell?.allValues).toBeUndefined()
    expect(hctCell?.allValues).toBeUndefined()
  })
})
