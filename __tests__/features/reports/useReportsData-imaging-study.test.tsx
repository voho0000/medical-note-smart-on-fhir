import { renderHook } from '@testing-library/react'
import { LanguageProvider } from '@/src/application/providers/language.provider'
import { AudienceProvider } from '@/src/application/providers/audience.provider'
import { useReportsData } from '@/features/clinical-summary/reports/hooks/useReportsData'

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <LanguageProvider>
    <AudienceProvider>{children}</AudienceProvider>
  </LanguageProvider>
)

const study = {
  id: 'study-1',
  status: 'available',
  started: '2026-06-01T09:30:00+08:00',
  description: 'CT chest without contrast',
  modality: [{ code: 'CT', display: 'Computed Tomography' }],
  location: { reference: 'Location/rad', display: 'Radiology Department' },
  reasonCode: [{ text: 'Persistent cough' }],
  note: [{ text: 'IMMIS metadata only' }],
  numberOfSeries: 1,
  numberOfInstances: 2,
  series: [{
    uid: '1.2.3',
    number: 1,
    modality: { code: 'CT', display: 'Computed Tomography' },
    description: 'Axial lung series',
    bodySite: { code: 'CHEST', display: 'Chest' },
    laterality: { code: 'B', display: 'Bilateral' },
    numberOfInstances: 2,
    instance: [
      { uid: '1.2.3.1', title: 'Scout view' },
      { uid: '1.2.3.2', title: 'Axial image' },
    ],
  }],
}

function run(diagnosticReports: any[], imagingStudies: any[]) {
  const { result } = renderHook(
    () => useReportsData(diagnosticReports, imagingStudies),
    { wrapper: Wrapper },
  )
  return result.current.reportRows
}

describe('useReportsData — ImagingStudy metadata', () => {
  it('renders a standalone ImagingStudy in the Imaging group', () => {
    const rows = run([], [study])

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: 'study-1',
      title: 'CT chest without contrast',
      group: 'imaging',
      institution: 'Radiology Department',
      effectiveDate: '2026-06-01T09:30:00+08:00',
      imagingStudyIds: ['study-1'],
    })
    const text = rows[0].obs[0]?.valueString || ''
    expect(text).toContain('Persistent cough')
    expect(text).toContain('Axial lung series')
    expect(text).toContain('Chest')
    expect(text).toContain('Bilateral')
    expect(text).toContain('Scout view')
    expect(text).toContain('IMMIS metadata only')
  })

  it('merges a metadata-only DiagnosticReport with its ImagingStudy into one row', () => {
    const rows = run([{
      id: 'report-1',
      status: 'final',
      code: { text: 'Chest CT' },
      effectiveDateTime: '2026-06-01T09:30:00+08:00',
      // Deliberately no category / conclusion / note / result / presentedForm.
      imagingStudy: [{ reference: 'ImagingStudy/study-1' }],
    }], [study])

    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe('report-1')
    expect(rows[0].group).toBe('imaging')
    expect(rows[0].imagingStudyIds).toEqual(['study-1'])
    expect(rows[0].obs[0]?.valueString).toContain('CT chest without contrast')
    expect(rows[0].obs[0]?.valueString).toContain('Axial image')
  })

  it('merges linked studies but keeps unrelated standalone studies', () => {
    const secondStudy = {
      ...study,
      id: 'study-2',
      description: 'Brain MRI',
      modality: [{ code: 'MR', display: 'Magnetic Resonance' }],
      series: [],
    }
    const rows = run([{
      id: 'report-1',
      code: { text: 'Chest CT' },
      imagingStudy: [{ reference: 'ImagingStudy/study-1' }],
    }], [study, secondStudy])

    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.id)).toEqual(expect.arrayContaining(['report-1', 'study-2']))
  })

  it('keeps a DiagnosticReport visible when only its ImagingStudy reference is available', () => {
    const rows = run([{
      id: 'report-1',
      code: { text: 'External CT' },
      imagingStudy: [{ reference: 'ImagingStudy/not-returned' }],
    }], [])

    expect(rows).toHaveLength(1)
    expect(rows[0].group).toBe('imaging')
    expect(rows[0].obs[0]?.valueString).toContain('not-returned')
  })
})
