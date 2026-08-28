import { act, renderHook, waitFor } from '@testing-library/react'
import { useReportTabCounts } from '@/features/clinical-summary/reports/hooks/useReportTabCounts'
import { calculateReportTabCounts } from '@/features/clinical-summary/reports/utils/report-tab-counts'

const category = (code: string) => [{
  coding: [{
    system: 'http://terminology.hl7.org/CodeSystem/observation-category',
    code,
  }],
}]

const v2Category = (code: string) => [{
  coding: [{
    system: 'http://terminology.hl7.org/CodeSystem/v2-0074',
    code,
  }],
}]

const performer = (display: string) => [{ display }]

describe('calculateReportTabCounts', () => {
  it('counts the lightweight tab projections using the same primary grouping units', () => {
    const linkedWbc = {
      id: 'obs-wbc',
      category: category('laboratory'),
      code: { text: 'WBC' },
      valueQuantity: { value: 5 },
      effectiveDateTime: '2026-06-02T08:00:00+08:00',
      performer: performer('示範醫院'),
    }
    const linkedRbc = {
      id: 'obs-rbc',
      category: category('laboratory'),
      code: { text: 'RBC' },
      valueQuantity: { value: 4.2 },
      effectiveDateTime: '2026-06-02T08:00:00+08:00',
      performer: performer('示範醫院'),
    }
    const linkedHb = {
      id: 'obs-hb',
      category: category('laboratory'),
      code: { text: 'HB' },
      valueQuantity: { value: 13 },
      effectiveDateTime: '2026-06-02T08:00:00+08:00',
      performer: performer('示範醫院'),
    }
    const diagnosticReports = [
      // Same code/day/institution = one All row.
      {
        id: 'dr-cbc-a',
        category: category('laboratory'),
        code: { text: 'CBC' },
        effectiveDateTime: '2026-06-02T08:00:00+08:00',
        _observations: [linkedWbc],
      },
      {
        id: 'dr-cbc-b',
        category: category('laboratory'),
        code: { text: 'CBC' },
        effectiveDateTime: '2026-06-02T08:00:00+08:00',
        _observations: [linkedRbc],
      },
      // A different report row, but the default Lab view folds it into the
      // same day/institution/CBC-category card.
      {
        id: 'dr-hb',
        category: category('laboratory'),
        code: { text: 'Hemoglobin' },
        effectiveDateTime: '2026-06-02T08:00:00+08:00',
        _observations: [linkedHb],
      },
      {
        id: 'dr-xray',
        category: category('imaging'),
        code: { text: 'Chest X-Ray' },
        effectiveDateTime: '2026-06-01T09:00:00+08:00',
        performer: performer('示範醫院'),
        imagingStudy: [{ reference: 'ImagingStudy/study-linked' }],
        conclusion: 'No acute cardiopulmonary finding.',
      },
      {
        id: 'dr-pathology',
        category: [{
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/v2-0074',
            code: 'PAT',
          }],
        }],
        code: { text: 'Surgical pathology' },
        effectiveDateTime: '2026-05-28T09:00:00+08:00',
        performer: performer('示範醫院'),
        conclusion: 'Benign tissue.',
      },
    ]
    const codedOnlyLab = {
      id: 'obs-blood-type',
      category: category('laboratory'),
      code: { text: 'WBC' },
      valueCodeableConcept: { text: 'Positive' },
      effectiveDateTime: '2026-06-03T08:00:00+08:00',
      performer: performer('示範醫院'),
    }
    const vital = {
      id: 'obs-heart-rate',
      category: category('vital-signs'),
      code: { text: 'Heart rate' },
      valueQuantity: { value: 72 },
      effectiveDateTime: '2026-06-03T08:05:00+08:00',
    }
    const imagingStudies = [
      { id: 'study-linked', description: 'Chest X-Ray', started: '2026-06-01T09:00:00+08:00' },
      { id: 'study-standalone', description: 'Brain MRI', started: '2026-05-20T09:00:00+08:00' },
    ]
    const procedures = [
      { id: 'proc-main', code: { text: 'Main procedure' } },
      { id: 'proc-child', code: { text: 'Child procedure' }, partOf: [{ reference: 'Procedure/proc-main' }] },
      { id: 'proc-standalone', code: { text: 'Standalone procedure' } },
    ]

    const counts = calculateReportTabCounts(
      diagnosticReports,
      imagingStudies,
      // Report-linked observations are present in the source superset but must
      // not become orphan rows. codedOnlyLab verifies valueCodeableConcept.
      [linkedWbc, linkedRbc, linkedHb, codedOnlyLab, vital],
      procedures,
    )

    expect(counts).toEqual({
      // DR groups: 4; orphan rows: 2; Procedure mains: 2; standalone study: 1.
      all: 9,
      // Two CBC-category collection days at the same institution.
      lab: 2,
      imaging: 2,
      pathology: 1,
      cancerScreening: 0,
      vitals: 1,
      procedures: 2,
    })
  })

  it('keeps distinct CT narratives in All but merges their imaging display group', () => {
    const base = {
      category: category('imaging'),
      code: { text: 'CT' },
      effectiveDateTime: '2026-06-02T08:00:00+08:00',
      performer: performer('示範醫院'),
    }
    const counts = calculateReportTabCounts([
      { ...base, id: 'ct-head', conclusion: 'Head CT shows no acute hemorrhage.' },
      { ...base, id: 'ct-chest', conclusion: 'Chest CT shows a pulmonary nodule.' },
      { ...base, id: 'ct-abdomen', conclusion: 'Abdominal CT shows a renal cyst.' },
    ], [], [], [])

    expect(counts).toEqual({
      all: 3,
      lab: 0,
      imaging: 1,
      pathology: 0,
      cancerScreening: 0,
      vitals: 0,
      procedures: 0,
    })
  })

  it('counts EC and OTH in Imaging and SP in Patho for the shared NHI report source', () => {
    const counts = calculateReportTabCounts([
      {
        id: 'dr-ekg',
        category: v2Category('EC'),
        code: { coding: [{ code: '18001C' }], text: '12-lead EKG' },
        effectiveDateTime: '2026-06-02T08:00:00+08:00',
        conclusion: 'Sinus rhythm.',
      },
      {
        id: 'dr-endoscopy',
        category: v2Category('OTH'),
        code: { text: 'Upper GI endoscopy report' },
        effectiveDateTime: '2026-06-01T12:00:00+08:00',
        conclusion: 'No active bleeding.',
      },
      {
        id: 'dr-surgical-pathology',
        category: v2Category('SP'),
        code: { coding: [{ code: '25025C' }], text: '第六級外科病理' },
        effectiveDateTime: '2026-06-01T08:00:00+08:00',
        conclusion: 'Surgical pathology report.',
      },
    ], [], [], [])

    expect(counts).toEqual({
      all: 3,
      lab: 0,
      imaging: 2,
      pathology: 1,
      cancerScreening: 0,
      vitals: 0,
      procedures: 0,
    })
  })

  it('treats strict-prefix CT narratives as one duplicate report row', () => {
    const base = {
      category: category('imaging'),
      code: { text: 'Computed Tomography' },
      effectiveDateTime: '2026-06-02T08:00:00+08:00',
      performer: performer('示範醫院'),
    }
    const counts = calculateReportTabCounts([
      { ...base, id: 'ct-short', conclusion: 'No acute finding.' },
      { ...base, id: 'ct-long', conclusion: 'No acute finding. Stable chronic change.' },
    ], [], [], [])

    expect(counts.all).toBe(1)
    expect(counts.imaging).toBe(1)
  })

  it('counts only the explicit MediCloud program category as cancer screening', () => {
    const cancerScreeningCategory = [{
      coding: [{
        system: 'https://cloud-wildcatch.invalid/fhir/CodeSystem/medcloud-observation-program',
        code: 'cancer-screening',
      }],
    }]
    const counts = calculateReportTabCounts([], [], [
      {
        id: 'screening-colorectal',
        category: cancerScreeningCategory,
        code: { text: '大腸癌篩檢' },
        valueString: '無異常',
        effectiveDateTime: '2023-04-20',
      },
      {
        id: 'screening-colorectal-proposal',
        category: cancerScreeningCategory,
        code: { text: '大腸癌篩檢建議' },
        valueString: '<p>建議每2年定期接受糞便潛血檢查。</p>',
      },
      {
        id: 'screening-mammography-proposal',
        category: cancerScreeningCategory,
        code: { text: '乳癌篩檢建議' },
        valueString: '<p>建議每2年定期接受乳房X光攝影檢查。</p>',
      },
      {
        id: 'tumor-marker-cea',
        category: category('laboratory'),
        code: { text: 'CEA cancer marker' },
        valueQuantity: { value: 2.1, unit: 'ng/mL' },
        effectiveDateTime: '2023-04-20',
      },
    ], [])

    // Result + recommendation are separate FHIR resources but one clickable
    // screening-programme group in both All and Cancer screening.
    expect(counts.all).toBe(3)
    expect(counts.cancerScreening).toBe(2)
    expect(counts.lab).toBe(1)
  })
})

describe('useReportTabCounts', () => {
  it('waits until after paint and browser idle, then preserves the result for stable resources', async () => {
    const animationFrames: FrameRequestCallback[] = []
    const idleCallbacks: IdleRequestCallback[] = []
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      animationFrames.push(callback)
      return animationFrames.length
    })
    Object.defineProperty(window, 'requestIdleCallback', {
      configurable: true,
      value: jest.fn((callback: IdleRequestCallback) => {
        idleCallbacks.push(callback)
        return idleCallbacks.length
      }),
    })
    Object.defineProperty(window, 'cancelIdleCallback', {
      configurable: true,
      value: jest.fn(),
    })
    const diagnosticReports = [{
      id: 'dr-1',
      category: category('laboratory'),
      code: { text: 'CBC' },
    }]
    const imagingStudies: any[] = []
    const observations: any[] = []
    const procedures: any[] = []
    const { result, rerender } = renderHook(
      (props) => useReportTabCounts(
        props.diagnosticReports,
        props.imagingStudies,
        props.observations,
        props.procedures,
      ),
      {
        initialProps: {
          diagnosticReports,
          imagingStudies,
          observations,
          procedures,
        },
      },
    )
    expect(result.current).toBeNull()

    act(() => animationFrames.shift()?.(0))
    expect(result.current).toBeNull()

    act(() => idleCallbacks.shift()?.({
      didTimeout: false,
      timeRemaining: () => 20,
    }))
    await waitFor(() => expect(result.current).not.toBeNull())
    const first = result.current

    rerender({ diagnosticReports, imagingStudies, observations, procedures })

    expect(result.current).toBe(first)
    jest.restoreAllMocks()
    Object.defineProperty(window, 'requestIdleCallback', {
      configurable: true,
      value: undefined,
    })
    Object.defineProperty(window, 'cancelIdleCallback', {
      configurable: true,
      value: undefined,
    })
  })
})
