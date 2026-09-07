import { buildReportsData } from '@/features/clinical-summary/reports/hooks/useReportsData'

/* eslint-disable @typescript-eslint/no-require-imports */
const {
  DEMO_ECHO_NARRATIVE,
  ECHO_ENCOUNTER_ID,
  DOPPLER_REPORT_ID,
  ECHO_REPORT_ID,
  FIXTURE_SOURCE,
  FIXTURE_TAG_CODE,
  addDemoEchoFixture,
} = require('../../scripts/demo-echo-fixture.cjs')

const demoBundle = require('../../public/demo/demo-bundle.json') as {
  entry: Array<{ resource: any }>
}
/* eslint-enable @typescript-eslint/no-require-imports */

const FIXTURE_IDS = new Set([ECHO_REPORT_ID, DOPPLER_REPORT_ID])

describe('curated demo echo fixture', () => {
  it('ships the two linked source procedures as one complete shared report card', () => {
    const resources = demoBundle.entry.map((entry) => entry.resource)
    const reports = resources.filter((resource) => FIXTURE_IDS.has(resource.id))

    expect(reports).toHaveLength(2)
    expect(reports.map((report) => report.code.coding[0].code).sort()).toEqual(['18005C', '18007C'])
    expect(new Set(reports.map((report) => report.code.coding[0].system))).toEqual(new Set([
      'https://twcore.mohw.gov.tw/CodeSystem/nhi-medical-order-code',
    ]))
    expect(new Set(reports.map((report) => report.category[0].coding[0].code))).toEqual(new Set(['CUS']))
    expect(new Set(reports.map((report) => report.subject.reference))).toEqual(new Set(['Patient/demo-patient-1']))
    expect(new Set(reports.map((report) => report.encounter.reference))).toEqual(new Set(['Encounter/demo-encounter-echo']))
    expect(new Set(reports.map((report) => report.effectiveDateTime))).toEqual(new Set(['2024-09-09T00:00:00+08:00']))
    expect(new Set(reports.map((report) => report.issued))).toEqual(new Set(['2024-10-28T00:00:00+08:00']))
    expect(resources.find((resource) => resource.id === ECHO_ENCOUNTER_ID)?.period).toEqual({
      start: '2024-09-09T00:00:00+08:00', end: '2024-09-09T00:00:00+08:00',
    })
    expect(new Set(reports.map((report) => report.performer[0].display))).toEqual(new Set(['示範長青醫院']))
    expect(new Set(reports.map((report) => report.conclusion))).toEqual(new Set([DEMO_ECHO_NARRATIVE]))

    const { reportRows } = buildReportsData(reports, [], 'standardized', 'medical', 'zh-TW')
    expect(reportRows).toHaveLength(1)
    expect(reportRows[0]).toEqual(expect.objectContaining({
      title: 'Echocardiography (including Doppler)',
      diagnosticReportIds: [ECHO_REPORT_ID, DOPPLER_REPORT_ID],
    }))
    expect(reportRows[0].sharedReportSources).toHaveLength(2)
    expect(reportRows[0].obs[0].valueString).toBe(DEMO_ECHO_NARRATIVE)
  })

  it('retains the detailed measurements and conclusions without identity-bearing attachments', () => {
    const reports = demoBundle.entry
      .map((entry) => entry.resource)
      .filter((resource) => FIXTURE_IDS.has(resource.id))

    expect(DEMO_ECHO_NARRATIVE).toContain('EF(MM)       72.6')
    expect(DEMO_ECHO_NARRATIVE).toContain('LV Dias dysfunction: Grade 1')
    expect(DEMO_ECHO_NARRATIVE).toContain('AR:mild')
    expect(DEMO_ECHO_NARRATIVE).toContain('PR:mild')
    for (const report of reports) {
      expect(report.meta.source).toBe(FIXTURE_SOURCE)
      expect(report.meta.tag).toContainEqual(expect.objectContaining({ code: FIXTURE_TAG_CODE }))
      expect(report.id).toMatch(/^demo-/)
      expect(report.subject.reference).toMatch(/^Patient\/demo-/)
      expect(report.encounter.reference).toMatch(/^Encounter\/demo-/)
      expect(report.performer[0].display).toMatch(/^示範/)
      expect(report.identifier).toBeUndefined()
      expect(report.presentedForm).toBeUndefined()
      expect(JSON.stringify(report)).not.toMatch(/https?:\/\/[^" ]*(?:viewer|dicom)/i)
    }
  })

  it('adds the pair without mutating existing demo resources and is idempotent', () => {
    const originalResources = demoBundle.entry
      .map((entry) => entry.resource)
      .filter((resource) => !FIXTURE_IDS.has(resource.id) && resource.id !== ECHO_ENCOUNTER_ID)
    const before = JSON.stringify(originalResources)

    const first = addDemoEchoFixture(originalResources)
    expect(first.addedResources).toHaveLength(3)
    expect(JSON.stringify(originalResources)).toBe(before)
    expect(first.anchorEncounterId).toBe('demo-encounter-echo')

    const second = addDemoEchoFixture(first.resources)
    expect(second.addedResources).toHaveLength(0)
    expect(second.resources).toBe(first.resources)
    expect(second.resources.filter((resource: any) => FIXTURE_IDS.has(resource.id))).toHaveLength(2)
  })

  it('retains the curated pair on its original encounter when a newer hospital visit appears', () => {
    const resources = demoBundle.entry.map((entry) => entry.resource)
    const newerEncounter = {
      resourceType: 'Encounter',
      id: 'demo-encounter-future',
      status: 'finished',
      class: { code: 'AMB' },
      subject: { reference: 'Patient/demo-patient-1' },
      serviceProvider: { display: '示範未來醫院' },
      period: { start: '2027-01-15T00:00:00+08:00' },
    }
    const beforeFixtures = resources.filter((resource) => FIXTURE_IDS.has(resource.id))

    const result = addDemoEchoFixture([...resources, newerEncounter])

    expect(result.addedResources).toHaveLength(0)
    expect(result.anchorEncounterId).toBe('demo-encounter-echo')
    expect(result.resources.filter((resource: any) => FIXTURE_IDS.has(resource.id))).toEqual(beforeFixtures)
  })

  it('refuses to overwrite a non-fixture resource that reuses a reserved id', () => {
    const resources = demoBundle.entry
      .map((entry) => entry.resource)
      .filter((resource) => !FIXTURE_IDS.has(resource.id) && resource.id !== ECHO_ENCOUNTER_ID)
    const collidingReport = {
      resourceType: 'DiagnosticReport',
      id: ECHO_REPORT_ID,
      status: 'final',
      code: { text: 'Unrelated report' },
    }

    expect(() => addDemoEchoFixture([...resources, collidingReport]))
      .toThrow(`Demo echo fixture id collision: ${ECHO_REPORT_ID}`)
  })
})
