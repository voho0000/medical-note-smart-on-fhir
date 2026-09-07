import { imagingReportsCategory } from '@/src/core/categories/imaging-reports.category'

const study = {
  id: 'study-1',
  status: 'available',
  started: '2026-06-01T09:30:00+08:00',
  description: 'CT chest without contrast',
  modality: [{ code: 'CT', display: 'Computed Tomography' }],
  reasonCode: [{ text: 'Persistent cough' }],
  series: [{
    uid: '1.2.3',
    number: 1,
    description: 'Axial lung series',
    modality: { code: 'CT', display: 'Computed Tomography' },
    bodySite: { code: 'CHEST', display: 'Chest' },
    instance: [{ uid: '1.2.3.1', title: 'Scout view' }],
  }],
}

const filters = {
  imagingReportVersion: 'all',
  imagingReportTimeRange: 'all',
} as any

describe('imagingReportsCategory — ImagingStudy', () => {
  it('includes a category-less Health Bank chest X-ray for AI selection', () => {
    const clinicalData = {
      diagnosticReports: [{
        id: 'sdk-r8-32001c',
        status: 'final',
        code: {
          coding: [{ system: 'nhi', code: '32001C' }],
          text: '胸腔檢查（包括各種角度部位之胸腔檢查）',
        },
        effectiveDateTime: '2026-06-02',
        conclusion: 'Radiography of Chest A-P View(Supine)',
      }],
      imagingStudies: [],
      observations: [],
      encounters: [],
    }

    const data = imagingReportsCategory.extractData(clinicalData)
    expect(data.map((report) => report.id)).toEqual(['sdk-r8-32001c'])
    expect(imagingReportsCategory.getCount(data, filters, clinicalData)).toBe(1)
  })

  it('includes a category-less Health Bank pathology report for AI selection', () => {
    const clinicalData = {
      diagnosticReports: [{
        id: 'sdk-r8-pathology',
        status: 'final',
        code: {
          coding: [{ system: 'nhi', code: '25004C' }],
          text: '第四級外科病理',
        },
        effectiveDateTime: '2026-06-03',
        conclusion: 'Pathology report content',
      }],
      imagingStudies: [],
      observations: [],
      encounters: [],
    }

    const data = imagingReportsCategory.extractData(clinicalData)
    expect(data.map((report) => report.id)).toEqual(['sdk-r8-pathology'])
  })

  it('includes a linked metadata-only report once and exposes study text to AI context', () => {
    const clinicalData = {
      diagnosticReports: [{
        id: 'report-1',
        status: 'final',
        code: { text: 'Chest CT' },
        imagingStudy: [{ reference: 'ImagingStudy/study-1' }],
      }],
      imagingStudies: [study],
      observations: [],
      encounters: [],
    }

    const data = imagingReportsCategory.extractData(clinicalData)
    expect(data).toHaveLength(1)
    expect(imagingReportsCategory.getCount(data, filters, clinicalData)).toBe(1)

    const section = imagingReportsCategory.getContextSection(data, filters, clinicalData)
    expect(section && !Array.isArray(section) ? section.items.join('\n') : '').toContain('Persistent cough')
    expect(section && !Array.isArray(section) ? section.items.join('\n') : '').toContain('Axial lung series')
    expect(section && !Array.isArray(section) ? section.items.join('\n') : '').toContain('Scout view')
  })

  it('includes standalone ImagingStudy resources', () => {
    const clinicalData = {
      diagnosticReports: [],
      imagingStudies: [study],
      observations: [],
      encounters: [],
    }

    const data = imagingReportsCategory.extractData(clinicalData)
    expect(data).toHaveLength(1)
    expect(data[0].resourceType).toBe('ImagingStudy')
    expect(imagingReportsCategory.getCount(data, filters, clinicalData)).toBe(1)
  })

  it('includes every report when the user selects All Reports', () => {
    const reports = Array.from({ length: 30 }, (_, index) => ({
      id: `report-${index + 1}`,
      status: 'final',
      code: { text: `Imaging report ${index + 1}` },
      effectiveDateTime: `2026-06-${String(index + 1).padStart(2, '0')}T00:00:00Z`,
      conclusion: `Finding ${index + 1}`,
    }))
    const clinicalData = { observations: [], encounters: [] }

    const section = imagingReportsCategory.getContextSection(reports as any, filters, clinicalData as any)
    const items = section && !Array.isArray(section) ? section.items : []

    expect(items).toHaveLength(30)
    expect(items.join('\n')).toContain('Imaging report 1')
    expect(items.join('\n')).toContain('Imaging report 30')
    expect(items.some((item) => item.includes('omitted for brevity'))).toBe(false)
  })

  it('counts an exact shared narrative once while retaining every source and distinct result', () => {
    const shared = {
      status: 'final',
      subject: { reference: 'Patient/p-1' },
      encounter: { reference: 'Encounter/e-1' },
      effectiveDateTime: '2026-06-05T09:00:00+08:00',
      performer: [{ display: '甲醫學中心' }],
      conclusion: 'LVEF 63%. Mild mitral regurgitation.',
    }
    const reports = [
      {
        ...shared,
        id: 'echo-2d',
        code: { text: '2D echocardiography', coding: [{ code: '18005C' }] },
        result: [{ reference: 'Observation/ef' }],
        _observations: [{
          id: 'image-quality',
          status: 'final',
          code: { text: 'Image quality score' },
          valueQuantity: { value: 4, unit: '/5' },
        }],
        presentedForm: [{ title: '2D cine loop', contentType: 'image/jpeg', url: 'https://example.test/2d' }],
      },
      {
        ...shared,
        id: 'echo-doppler',
        code: { text: 'Doppler echocardiography', coding: [{ code: '18007C' }] },
        result: [{ reference: 'Observation/velocity' }],
        _observations: [{
          id: 'gradient',
          status: 'final',
          code: { text: 'Pressure gradient' },
          valueQuantity: { value: 6, unit: 'mmHg' },
        }],
        presentedForm: [{ title: 'Doppler waveform', contentType: 'image/png', url: 'https://example.test/doppler' }],
      },
    ]
    const clinicalData = {
      observations: [
        {
          id: 'ef',
          status: 'final',
          code: { text: 'Ejection fraction' },
          valueQuantity: { value: 63, unit: '%' },
        },
        {
          id: 'velocity',
          status: 'final',
          code: { text: 'Peak velocity' },
          valueQuantity: { value: 1.2, unit: 'm/s' },
        },
      ],
      encounters: [],
    }

    expect(imagingReportsCategory.getCount(reports as any, filters, clinicalData as any)).toBe(1)

    const section = imagingReportsCategory.getContextSection(reports as any, filters, clinicalData as any)
    const text = section && !Array.isArray(section) ? section.items.join('\n') : ''
    expect(text.match(/LVEF 63%\. Mild mitral regurgitation\./g)).toHaveLength(1)
    expect(text).toContain('2D echocardiography [codes: 18005C] [id: echo-2d]')
    expect(text).toContain('Doppler echocardiography [codes: 18007C] [id: echo-doppler]')
    expect(text).toContain('Ejection fraction: 63 %')
    expect(text).toContain('Peak velocity: 1.2 m/s')
    expect(text).toContain('Image quality score: 4 /5')
    expect(text).toContain('Pressure gradient: 6 mmHg')
    expect(text).toContain('2D cine loop: [URL-backed report attachment not resolved; contentType=image/jpeg]')
    expect(text).toContain('Doppler waveform: [URL-backed report attachment not resolved; contentType=image/png]')
    expect(text).toContain('[shared narrative; count once]')
  })

  it('does not group reports linked only by an inferred encounter', () => {
    const common = {
      status: 'final',
      subject: { reference: 'Patient/p-1' },
      encounter: { reference: 'Encounter/inferred' },
      _encounterInferred: true,
      effectiveDateTime: '2026-06-05',
      performer: [{ display: '甲醫學中心' }],
      conclusion: 'Identical report text.',
    }
    const reports = [
      { ...common, id: 'r-1', code: { text: 'Procedure A', coding: [{ code: 'A' }] } },
      { ...common, id: 'r-2', code: { text: 'Procedure B', coding: [{ code: 'B' }] } },
    ]
    const clinicalData = { observations: [], encounters: [] }

    expect(imagingReportsCategory.getCount(reports as any, filters, clinicalData as any)).toBe(2)
    const section = imagingReportsCategory.getContextSection(reports as any, filters, clinicalData as any)
    const text = section && !Array.isArray(section) ? section.items.join('\n') : ''
    expect(text.match(/Identical report text\./g)).toHaveLength(2)
    expect(text).not.toContain('[shared narrative; count once]')
  })
})
