import {
  HEALTH_BANK_SDK_SECTION_SYSTEM,
  inferGroupFromDiagnosticReport,
} from '@/src/shared/utils/report-grouping-helpers'

describe('inferGroupFromDiagnosticReport', () => {
  it('recognizes a category-less Health Bank chest X-ray by NHI order code', () => {
    expect(inferGroupFromDiagnosticReport({
      code: {
        coding: [{ system: 'nhi', code: '32001C' }],
        text: '胸腔檢查（包括各種角度部位之胸腔檢查）',
      },
      conclusion: 'Radiography of Chest A-P View(Supine)',
    } as any)).toBe('imaging')
  })

  it('recognizes category-less imaging reports by the order title', () => {
    expect(inferGroupFromDiagnosticReport({
      code: { text: 'Radiography of chest' },
    })).toBe('imaging')
  })

  it('puts every explicitly tagged SDK r8 report in the shared imaging/pathology group', () => {
    expect(inferGroupFromDiagnosticReport({
      category: [{
        coding: [{
          system: HEALTH_BANK_SDK_SECTION_SYSTEM,
          code: 'r8',
          display: 'Imaging or pathology report',
        }],
        text: '影像或病理檢查報告',
      }],
      code: { text: 'Unmapped r8 report' },
    })).toBe('imaging')
  })

  it('recognizes an older category-less Health Bank pathology report', () => {
    expect(inferGroupFromDiagnosticReport({
      code: {
        coding: [{ system: 'nhi', code: '25004C' }],
        text: '第四級外科病理',
      },
    })).toBe('imaging')
  })

  it('does not infer imaging from conclusion text alone', () => {
    expect(inferGroupFromDiagnosticReport({
      code: { text: 'Discharge summary' },
      conclusion: 'Follow up the prior chest X-ray.',
    } as any)).toBe('other')
  })

  it('preserves an explicit source category over fallback rules', () => {
    expect(inferGroupFromDiagnosticReport({
      category: [{
        coding: [{
          system: 'http://terminology.hl7.org/CodeSystem/v2-0074',
          code: 'LAB',
        }],
      }],
      code: { coding: [{ code: '32001C' }], text: 'Chest X-ray' },
    })).toBe('lab')
  })

  it('recognizes an ImagingStudy link without an explicit category', () => {
    expect(inferGroupFromDiagnosticReport({
      code: { text: 'External study' },
      imagingStudy: [{ reference: 'ImagingStudy/study-1' }],
    })).toBe('imaging')
  })
})
