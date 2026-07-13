import { LocalBundleService } from '@/src/infrastructure/fhir/services/local-bundle.service'

function imagingBundle(): any {
  return {
    resourceType: 'Bundle',
    type: 'collection',
    entry: [
      {
        resource: {
          resourceType: 'Patient',
          id: 'patient-1',
          gender: 'female',
        },
      },
      {
        resource: {
          resourceType: 'ImagingStudy',
          id: 'study-1',
          status: 'available',
          subject: { reference: 'Patient/patient-1' },
          started: '2026-06-01T09:30:00+08:00',
          description: 'CT chest without contrast',
          modality: [{ code: 'CT', display: 'Computed Tomography' }],
          reasonCode: [{ text: 'Persistent cough' }],
          note: [{ text: 'Imported IMMIS metadata' }],
          series: [{
            uid: '1.2.3',
            number: 1,
            description: 'Axial lung series',
            modality: { code: 'CT', display: 'Computed Tomography' },
            bodySite: { code: 'CHEST', display: 'Chest' },
            instance: [{ uid: '1.2.3.1', title: 'Scout view' }],
          }],
        },
      },
      {
        resource: {
          resourceType: 'DiagnosticReport',
          id: 'report-1',
          status: 'final',
          code: { text: 'Chest CT' },
          subject: { reference: 'Patient/patient-1' },
          effectiveDateTime: '2026-06-01T09:30:00+08:00',
          imagingStudy: [{ reference: 'ImagingStudy/study-1' }],
        },
      },
    ],
  }
}

describe('LocalBundleService.parse — ImagingStudy', () => {
  it('imports ImagingStudy metadata and preserves the DiagnosticReport link', () => {
    const data = LocalBundleService.parse(imagingBundle())!

    expect(data.collection.imagingStudies).toHaveLength(1)
    expect(data.collection.imagingStudies[0]).toMatchObject({
      id: 'study-1',
      description: 'CT chest without contrast',
      status: 'available',
      reasonCode: [{ text: 'Persistent cough' }],
    })
    expect(data.collection.imagingStudies[0].series?.[0]).toMatchObject({
      description: 'Axial lung series',
      bodySite: { display: 'Chest' },
    })
    expect(data.collection.imagingStudies[0].series?.[0].instance?.[0].title).toBe('Scout view')
    expect(data.collection.diagnosticReports[0].imagingStudy).toEqual([
      { reference: 'ImagingStudy/study-1' },
    ])
  })
})
