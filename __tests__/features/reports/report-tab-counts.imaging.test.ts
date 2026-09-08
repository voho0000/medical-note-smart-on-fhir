// Regression: pure-image DiagnosticReports (健保存摺 X-ray / ECG inlined as
// base64 in presentedForm by bridge v0.14.0+) carry no observations, no
// conclusion and no note. They must still be counted as a report row — the
// previous gate dropped them silently.
import { buildReportsData } from '@/features/clinical-summary/reports/hooks/useReportsData'
import { calculateReportTabCounts } from '@/features/clinical-summary/reports/utils/report-tab-counts'

const pureImageReport = {
  id: 'dr-xray-1',
  category: [{ coding: [{ code: 'RAD', display: 'Radiology' }] }],
  code: { text: 'Chest X-Ray' },
  effectiveDateTime: '2026-05-25T00:00:00+08:00',
  conclusion: '', // empty — the whole point of the regression
  presentedForm: [
    { contentType: 'image/jpeg', title: 'Chest X-Ray', data: 'BASE64DATA', size: 2087459 },
  ],
}

describe('calculateReportTabCounts — inline imaging', () => {
  it('counts a category-less Health Bank chest X-ray in Imaging', () => {
    const counts = calculateReportTabCounts([{
      id: 'sdk-r8-32001c',
      code: {
        coding: [{ system: 'nhi', code: '32001C' }],
        text: '胸腔檢查（包括各種角度部位之胸腔檢查）',
      },
      conclusion: 'Radiography of Chest A-P View(Supine)',
    }], [], [], [])

    expect(counts.all).toBe(1)
    expect(counts.imaging).toBe(1)
    expect(counts.lab).toBe(0)
  })

  it('counts a pure-image report (no obs / conclusion / note)', () => {
    const counts = calculateReportTabCounts([pureImageReport], [], [], [])
    expect(counts.all).toBe(1)
    expect(counts.imaging).toBe(1)
    expect(counts.lab).toBe(0)
  })

  it('keeps a metadata-only report and counts the same row shown in the list', () => {
    const emptyReport = {
      id: 'dr-empty',
      category: [{ coding: [{ code: 'RAD' }] }],
      code: { text: 'Nothing' },
      effectiveDateTime: '2026-05-25T00:00:00+08:00',
    }
    const counts = calculateReportTabCounts([emptyReport], [], [], [])
    const rows = buildReportsData([emptyReport]).reportRows
    expect(rows).toHaveLength(1)
    expect(rows[0].rawTitle).toBe('Nothing')
    expect(counts.all).toBe(rows.length)
  })

  it('counts a text+image report once', () => {
    const textPlusImage = {
      ...pureImageReport,
      id: 'dr-ct-1',
      code: { text: 'CT Abdomen' },
      conclusion: 'No acute findings.',
    }
    const counts = calculateReportTabCounts([textPlusImage], [], [], [])
    expect(counts.all).toBe(1)
    expect(counts.imaging).toBe(1)
  })
})
