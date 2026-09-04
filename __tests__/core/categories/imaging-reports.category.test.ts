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
    const context = section && !Array.isArray(section) ? section.items.join('\n') : ''
    expect(context).toContain('Persistent cough')
    expect(context).toContain('Axial lung series')
    expect(context).toContain('Scout view')
    expect(context).not.toContain('[L1]')
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
    const section = imagingReportsCategory.getContextSection(data, filters, clinicalData)
    expect(section && !Array.isArray(section) ? section.items.join('\n') : '').not.toContain('[X1]')
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
})

describe('imagingReportsCategory — impression-first AI context', () => {
  const narrative = (impression: string) => [
    'INDICATION: follow-up.',
    'TECHNIQUE: portable AP chest radiograph.',
    'FINDINGS: verbose description that should not reach the AI context.',
    `IMPRESSION: ${impression}`,
  ].join('\n')

  const report = (
    id: string,
    code: string,
    date: string,
    impression: string,
  ) => ({
    id,
    status: 'final',
    code: { text: code },
    effectiveDateTime: date,
    conclusion: narrative(impression),
  })

  const clinicalData = { observations: [], encounters: [] } as any

  const render = (reports: any[]) => {
    const section = imagingReportsCategory.getContextSection(reports, filters, clinicalData)
    return section && !Array.isArray(section) ? section.items : []
  }

  it('keeps only the impression of the current study of a kind', () => {
    const items = render([report('r1', 'Chest radiograph AP', '2026-08-10', 'Small left effusion. Stable lines.')])
    expect(items[0]).toBe('Chest radiograph AP (2026-08-10): IMPRESSION: Small left effusion. Stable lines.')
    expect(items.join('\n')).not.toContain('TECHNIQUE')
    expect(items.join('\n')).not.toContain('verbose description')
  })

  it('reduces older studies of the same kind to one citable line each', () => {
    const items = render([
      report('r1', 'Chest radiograph AP', '2026-08-10', 'Small left effusion. Stable lines.'),
      report('r2', 'CXR portable', '2026-06-07', 'Low lung volume. Crowded basal markings.'),
      report('r3', '胸部Ｘ光（床邊）', '2026-07-09', 'Increased left basilar opacity. Unchanged heart size.'),
    ])
    expect(items).toContain('Earlier studies (one-line impressions):')
    // Only the newest chest radiograph keeps its full impression.
    expect(items.filter((item) => item.startsWith('Chest radiograph AP'))).toHaveLength(1)
    const older = items.filter((item) => item.startsWith('2026-'))
    expect(older).toEqual([
      '2026-07-09 | XR chest | 胸部Ｘ光（床邊）: Increased left basilar opacity.',
      '2026-06-07 | XR chest | CXR portable: Low lung volume.',
    ])
    // The date + report title on each line is what resolves it to its
    // DiagnosticReport in the prompt's SOURCE LIST.
    expect(older.join('\n')).not.toMatch(/\[L\d+\]/)
  })

  it('keeps a different modality+region as its own current study', () => {
    const items = render([
      report('r1', 'Chest radiograph AP', '2026-08-10', 'Small left effusion.'),
      report('r2', 'MRI spine with contrast', '2026-07-05', 'Multifocal marrow lesions.'),
    ])
    expect(items.filter((item) => item.includes('IMPRESSION:'))).toHaveLength(2)
    expect(items.some((item) => item.startsWith('Earlier studies'))).toBe(false)
  })

  it('groups a study written in Chinese with its English-titled equivalent', () => {
    const items = render([
      report('r1', '胸腹骨盆電腦斷層', '2026-08-07', 'Known osseous and hepatic disease.'),
      report('r2', 'CT chest abdomen pelvis with contrast', '2026-07-06', 'Stable indexed lesions.'),
    ])
    expect(items.filter((item) => item.includes('IMPRESSION:'))).toHaveLength(1)
    expect(items).toContain(
      '2026-07-06 | CT chest+abdomen+pelvis | CT chest abdomen pelvis with contrast: Stable indexed lesions.',
    )
  })

  it('emits the full narrative when no conclusion header is recognised', () => {
    const items = render([{
      id: 'r1',
      status: 'final',
      code: { text: '胸腔檢查（包括各種角度部位之胸腔檢查）' },
      effectiveDateTime: '2026-06-02',
      conclusion: 'Radiography of Chest A-P View(Supine)',
    } as any])
    expect(items[0]).toContain('Radiography of Chest A-P View(Supine)')
  })
})
