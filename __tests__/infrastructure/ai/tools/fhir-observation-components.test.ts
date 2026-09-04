/** @jest-environment node */

import { createFhirTools } from '@/src/infrastructure/ai/tools/fhir-tools'
import { sampleCollection, samplePatient } from './fixtures'

function bloodPressure(id = 'bp-current', date = '2026-09-01T09:10:00+08:00', systolic = 128, diastolic = 80): any {
  return {
    id,
    resourceType: 'Observation',
    status: 'final',
    category: [{ coding: [{ code: 'vital-signs' }] }],
    code: { coding: [{ system: 'http://loinc.org', code: '85354-9', display: 'Blood pressure panel' }] },
    effectiveDateTime: date,
    encounter: { reference: 'Encounter/enc-amb-1' },
    component: [
      {
        code: { coding: [{ system: 'http://loinc.org', code: '8480-6', display: 'Systolic blood pressure' }] },
        valueQuantity: { value: systolic, unit: 'mmHg' },
      },
      {
        code: { coding: [{ system: 'http://loinc.org', code: '8462-4', display: 'Diastolic blood pressure' }] },
        valueQuantity: { value: diastolic, unit: 'mmHg' },
      },
    ],
  }
}

function toolsFor(panels: any[], vitalsOnly = false) {
  return createFhirTools(() => ({
    patient: samplePatient,
    collection: {
      ...sampleCollection,
      observations: vitalsOnly ? [] : panels,
      // A vital can occur in both collection lists; it is still one reading.
      vitalSigns: panels,
      diagnosticReports: [{
        id: 'bp-report', status: 'final', code: { text: 'Vital signs report' },
        _observations: panels,
      }] as any,
    },
  }))
}

const expectedPressure = [
  expect.objectContaining({ name: 'Systolic blood pressure', loinc: '8480-6', value: 128, unit: 'mmHg' }),
  expect.objectContaining({ name: 'Diastolic blood pressure', loinc: '8462-4', value: 80, unit: 'mmHg' }),
]

describe('FHIR Observation component values in agent tools', () => {
  it.each([
    { code: '85354-9' },
    { code: '8480-6' },
    { codeQuery: 'diastolic' },
  ])('returns the complete dated BP reading for queryObservations %j', async (args) => {
    const result = await (toolsFor([bloodPressure()]).queryObservations as any).execute(args)

    expect(result.count).toBe(1)
    expect(result.data[0]).toMatchObject({
      code: 'Blood pressure panel', date: '2026-09-01T09:10:00+08:00',
      components: expectedPressure,
    })
    expect(result.data[0].components.every((component: any) => component.assessmentBasis === 'not-provided')).toBe(true)
  })

  it.each(['blood pressure', 'systolic', '8462-4'])(
    'finds component values through name/code search %s', async (query) => {
      const result = await (toolsFor([bloodPressure()]).searchObservationByName as any).execute({ query })
      expect(result.count).toBe(1)
      expect(result.data[0].components).toEqual(expectedPressure)
    },
  )

  it('keeps both pressures together for each date and applies latest/trend selection to whole readings', async () => {
    const tools = toolsFor([
      bloodPressure('bp-old', '2026-08-01', 120, 70),
      bloodPressure(),
    ])
    const latest = await (tools.searchObservationByName as any).execute({ query: 'blood pressure' })
    const trend = await (tools.searchObservationByName as any).execute({ query: 'blood pressure', withTrend: true })

    expect(latest.count).toBe(1)
    expect(latest.data[0].components).toEqual(expectedPressure)
    expect(trend.data.map((row: any) => row.components.map((component: any) => component.value))).toEqual([
      [128, 80], [120, 70],
    ])
  })

  it('does not substitute an older diastolic value when the latest reading has an absent component', async () => {
    const latestPanel = bloodPressure()
    delete latestPanel.component[1].valueQuantity
    latestPanel.component[1].dataAbsentReason = { coding: [{ code: 'not-performed' }] }
    const result = await (toolsFor([
      bloodPressure('bp-old', '2026-08-01', 120, 70), latestPanel,
    ]).searchObservationByName as any).execute({ query: 'blood pressure' })
    const serialized = JSON.parse(JSON.stringify(result))

    expect(serialized.data[0].components[0].value).toBe(128)
    expect(serialized.data[0].components[1]).toMatchObject({ name: 'Diastolic blood pressure', dataAbsentReason: 'not-performed' })
    expect(serialized.data[0].components[1]).not.toHaveProperty('value')
  })

  it('includes component values in encounter details when vitals are stored separately', async () => {
    const result = await (toolsFor([bloodPressure()], true).getEncounterDetails as any).execute({ encounterId: 'enc-amb-1' })
    expect(result.data.observations).toHaveLength(1)
    expect(result.data.observations[0].components).toEqual(expectedPressure)
  })

  it('preserves the same components in reports and the compact health snapshot', async () => {
    const tools = toolsFor([bloodPressure()])
    const reports = await (tools.queryDiagnosticReports as any).execute({ query: 'systolic' })
    const snapshot = await (tools.getHealthSummarySnapshot as any).execute({})

    expect(reports.count).toBe(1)
    expect(reports.data[0].results[0].components).toEqual(expectedPressure)
    expect(snapshot.data.recentVitals[0].components).toEqual(expectedPressure)
  })

  it('lists component names for discovery without counting a shared vital twice', async () => {
    const result = await (toolsFor([bloodPressure()]).listAvailableObservationCodes as any).execute({})
    expect(result.data).toEqual(expect.arrayContaining([
      { code: 'Blood pressure panel', count: 1 },
      { code: 'Systolic blood pressure', count: 1 },
      { code: 'Diastolic blood pressure', count: 1 },
    ]))
  })

  it('preserves zero and coded units without forwarding raw component metadata', async () => {
    const panel = bloodPressure()
    panel.component[0].valueQuantity = { value: 0, code: 'mm[Hg]' }
    panel.component[0].extension = [{ url: 'https://example.org/private', valueString: 'private-component-metadata' }]
    const result = await (toolsFor([panel]).queryObservations as any).execute({ code: '85354-9' })

    expect(result.data[0].components[0]).toMatchObject({ value: 0, unit: 'mm[Hg]' })
    expect(JSON.stringify(result)).not.toContain('private-component-metadata')
  })
})
