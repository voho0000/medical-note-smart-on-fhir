// Regression: pure-image DiagnosticReports (健保存摺 X-ray / ECG inlined as
// base64 in presentedForm by bridge v0.14.0+) carry no observations, no
// conclusion and no note. They must still be counted as a report row — the
// previous gate dropped them silently.
import { calculateReportsRowCounts } from '@/src/shared/utils/reports-count.utils'

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

describe('calculateReportsRowCounts — inline imaging', () => {
  it('counts a pure-image report (no obs / conclusion / note)', () => {
    const counts = calculateReportsRowCounts([pureImageReport], [], [])
    expect(counts.total).toBe(1)
    expect(counts.imaging).toBe(1)
    expect(counts.lab).toBe(0)
  })

  it('still drops a truly empty report (no obs / conclusion / note / presentedForm)', () => {
    const emptyReport = {
      id: 'dr-empty',
      category: [{ coding: [{ code: 'RAD' }] }],
      code: { text: 'Nothing' },
      effectiveDateTime: '2026-05-25T00:00:00+08:00',
    }
    const counts = calculateReportsRowCounts([emptyReport], [], [])
    expect(counts.total).toBe(0)
  })

  it('counts a text+image report once', () => {
    const textPlusImage = {
      ...pureImageReport,
      id: 'dr-ct-1',
      code: { text: 'CT Abdomen' },
      conclusion: 'No acute findings.',
    }
    const counts = calculateReportsRowCounts([textPlusImage], [], [])
    expect(counts.total).toBe(1)
    expect(counts.imaging).toBe(1)
  })
})
