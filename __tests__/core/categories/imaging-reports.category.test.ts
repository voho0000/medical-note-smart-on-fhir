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
})
