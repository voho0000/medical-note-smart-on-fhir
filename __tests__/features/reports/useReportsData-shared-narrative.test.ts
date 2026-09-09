import { buildReportsData } from '@/features/clinical-summary/reports/hooks/useReportsData'
import { NHI_VIEWER_REQUEST_EXTENSION_URL } from '@/features/clinical-summary/reports/utils/nhi-viewer-request'

const REPORT_TEXT = 'DOPPLER & ECHOCARDIOGRAPHIC REPORT:\nNormal wall motion with adequate LV systolic function.'

function echoReport(overrides: Record<string, any> = {}) {
  return {
    resourceType: 'DiagnosticReport',
    id: 'echo',
    status: 'final',
    subject: { reference: 'Patient/example' },
    encounter: { reference: 'Encounter/visit-1' },
    code: {
      text: '超音波心臟圖',
      coding: [{ system: 'https://example.test/nhi-order', code: '18005C' }],
    },
    effectiveDateTime: '2024-09-09T09:00:00+08:00',
    performer: [{ display: '示範醫院' }],
    conclusion: REPORT_TEXT,
    ...overrides,
  }
}

function dopplerReport(overrides: Record<string, any> = {}) {
  return echoReport({
    id: 'doppler',
    code: {
      text: '杜卜勒氏彩色心臟血流圖',
      coding: [{ system: 'https://example.test/nhi-order', code: '18007C' }],
    },
    ...overrides,
  })
}

function viewerExtension(caseNo: string) {
  return {
    url: NHI_VIEWER_REQUEST_EXTENSION_URL,
    extension: [
      { url: 'version', valueInteger: 1 },
      { url: 'proc-id', valueCode: 'IMUE0130' },
      { url: 'patient-context-hash', valueString: 'b'.repeat(64) },
      { url: 'ipl-case-seq-no', valueString: caseNo },
    ],
  }
}

describe('buildReportsData shared narratives across source procedures', () => {
  it('shows one localized echo report while retaining every source identity', () => {
    const { reportRows } = buildReportsData(
      [echoReport(), dopplerReport({ conclusion: `  ${REPORT_TEXT.replace('\n', '  \n  ')}  ` })],
      [],
      'standardized',
      'medical',
      'zh-TW',
    )

    expect(reportRows).toHaveLength(1)
    expect(reportRows[0].title).toBe('Echocardiography (including Doppler)')
    expect(reportRows[0].diagnosticReportIds).toEqual(['echo', 'doppler'])
    expect(reportRows[0].sharedReportSources).toEqual([
      expect.objectContaining({ reportId: 'echo', title: '超音波心臟圖', codes: ['18005C'] }),
      expect.objectContaining({ reportId: 'doppler', title: '杜卜勒氏彩色心臟血流圖', codes: ['18007C'] }),
    ])
    expect(reportRows[0].obs[0]?.valueString).toBe(REPORT_TEXT)
    expect(reportRows[0].bridgeDupCount).toBeUndefined()
  })

  it('attaches viewer-only echo and Doppler records to their proven shared report', () => {
    const echoViewer = echoReport({
      id: 'echo-viewer-1',
      conclusion: undefined,
      extension: [viewerExtension('ECHO-1')],
    })
    const secondEchoViewer = echoReport({
      id: 'echo-viewer-2',
      conclusion: undefined,
      extension: [viewerExtension('ECHO-2')],
    })
    const dopplerViewer = dopplerReport({
      id: 'doppler-viewer-1',
      conclusion: undefined,
      extension: [viewerExtension('DOPPLER-1')],
    })
    const secondDopplerViewer = dopplerReport({
      id: 'doppler-viewer-2',
      conclusion: undefined,
      extension: [viewerExtension('DOPPLER-2')],
    })

    const { reportRows } = buildReportsData([
      dopplerViewer,
      dopplerReport(),
      echoViewer,
      secondEchoViewer,
      echoReport(),
      secondDopplerViewer,
    ])

    expect(reportRows).toHaveLength(1)
    expect(reportRows[0].title).toBe('Echocardiography (including Doppler)')
    expect(reportRows[0].obs[0]?.valueString).toBe(REPORT_TEXT)
    expect(reportRows[0].viewerActions).toHaveLength(4)
    expect(reportRows[0].diagnosticReportIds).toEqual([
      'doppler-viewer-1',
      'doppler',
      'echo-viewer-1',
      'echo-viewer-2',
      'echo',
      'doppler-viewer-2',
    ])
    expect(reportRows[0].sharedReportSources).toHaveLength(2)
  })

  it('does not attach viewer-only records across distinct echo narratives', () => {
    const { reportRows } = buildReportsData([
      echoReport(),
      dopplerReport({ conclusion: `${REPORT_TEXT}\nAdditional finding.` }),
      echoReport({
        id: 'echo-viewer',
        conclusion: undefined,
        extension: [viewerExtension('ECHO-1')],
      }),
    ])

    expect(reportRows).toHaveLength(2)
    expect(reportRows.some((row) => row.sharedReportSources)).toBe(false)
  })

  it('uses the Chinese combined echo title only for the patient audience in zh-TW', () => {
    const { reportRows } = buildReportsData(
      [echoReport(), dopplerReport()],
      [],
      'standardized',
      'patient',
      'zh-TW',
    )

    expect(reportRows[0].title).toBe('心臟超音波（含杜卜勒血流）')
  })

  it('keeps the combined echo title English for a patient using the English UI', () => {
    const { reportRows } = buildReportsData(
      [echoReport(), dopplerReport()],
      [],
      'standardized',
      'patient',
      'en',
    )

    expect(reportRows[0].title).toBe('Echocardiography (including Doppler)')
  })

  it('keeps structured results from every source while deduplicating only narrative text', () => {
    const { reportRows, seenIds } = buildReportsData([
      echoReport({
        _observations: [{
          id: 'ef-result',
          code: { text: 'EF' },
          valueQuantity: { value: 72.6, unit: '%' },
        }],
      }),
      dopplerReport({
        _observations: [{
          id: 'flow-result',
          code: { text: 'AV Vmax' },
          valueQuantity: { value: 114, unit: 'cm/s' },
        }],
      }),
    ])

    expect(reportRows).toHaveLength(1)
    expect(reportRows[0].obs.map((observation) => observation.id)).toEqual([
      'dr-summary-echo',
      'ef-result',
      'flow-result',
    ])
    expect(reportRows[0].obs.map((observation) => observation.code?.text)).toEqual([
      'Report Summary',
      'EF',
      'AV Vmax',
    ])
    expect(seenIds).toEqual(new Set(['ef-result', 'flow-result']))
  })

  it.each([
    ['subject', { subject: undefined }],
    ['encounter', { encounter: undefined }],
    ['inferred encounter', { _encounterInferred: true }],
    ['full exam date', { effectiveDateTime: '2024-09' }],
    ['valid exam date', { effectiveDateTime: '2024-99-99' }],
    ['institution', { performer: undefined }],
  ])('does not merge when explicit %s metadata is unavailable', (_label, missing) => {
    const { reportRows } = buildReportsData([echoReport(), dopplerReport(missing)])
    expect(reportRows).toHaveLength(2)
  })

  it('keeps different exam dates and different report text separate', () => {
    expect(buildReportsData([
      echoReport(),
      dopplerReport({ effectiveDateTime: '2024-09-10T09:00:00+08:00' }),
    ]).reportRows).toHaveLength(2)

    expect(buildReportsData([
      echoReport(),
      dopplerReport({ conclusion: `${REPORT_TEXT}\nAdditional finding.` }),
    ]).reportRows).toHaveLength(2)
  })

  it.each([
    ['patient', { subject: { reference: 'Patient/someone-else' } }],
    ['encounter', { encounter: { reference: 'Encounter/visit-2' } }],
    ['institution', { performer: [{ display: '其他醫院' }] }],
    ['status', { status: 'preliminary' }],
  ])('keeps reports with a different %s boundary separate', (_label, mismatch) => {
    const { reportRows } = buildReportsData([echoReport(), dopplerReport(mismatch)])
    expect(reportRows).toHaveLength(2)
  })

  it('does not merge empty narratives or use issued as a substitute exam date', () => {
    expect(buildReportsData([
      echoReport({ conclusion: '' }),
      dopplerReport({ conclusion: '' }),
    ]).reportRows).toHaveLength(2)

    expect(buildReportsData([
      echoReport({ effectiveDateTime: undefined, issued: '2024-09-09T12:00:00+08:00' }),
      dopplerReport({ effectiveDateTime: undefined, issued: '2024-09-09T12:00:00+08:00' }),
    ]).reportRows).toHaveLength(2)
  })

  it('does not merge different laboratory tests with the same generic conclusion', () => {
    const labCategory = [{
      coding: [{
        system: 'http://terminology.hl7.org/CodeSystem/observation-category',
        code: 'laboratory',
      }],
    }]
    const { reportRows } = buildReportsData([
      echoReport({ category: labCategory, code: { text: 'Test A' }, conclusion: 'Negative' }),
      dopplerReport({ category: labCategory, code: { text: 'Test B' }, conclusion: 'Negative' }),
    ])

    expect(reportRows).toHaveLength(2)
  })

  it('uses the ordinary source title when an exact shared report is not the echo pair', () => {
    const { reportRows } = buildReportsData([
      echoReport({ code: { text: 'Cardiac ultrasound', coding: [{ code: '19005C' }] } }),
      dopplerReport({ code: { text: 'Related imaging procedure', coding: [{ code: '19009C' }] } }),
    ], [], 'original')

    expect(reportRows).toHaveLength(1)
    expect(reportRows[0].title).toBe('Cardiac ultrasound')
  })
})
