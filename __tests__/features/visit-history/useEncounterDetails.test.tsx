// Regression locks for useEncounterDetails test grouping. A single visit's
// lab observations arrive interleaved from multiple DiagnosticReports /
// standalone Observations; the hook must cluster them into clinically ordered
// category groups (血液 before 生化 …) and sort within each group by the
// category's preferredOrder — otherwise CBC and biochem mix together, which
// is what users reported looked clinically wrong.
import { renderHook } from '@testing-library/react'
import { useEncounterDetails } from '@/features/clinical-summary/visit-history/hooks/useEncounterDetails'
import type { MedicationRow } from '@/features/clinical-summary/medications/types'

const obs = (id: string, text: string) => ({
  id,
  encounter: { reference: 'Encounter/e1' },
  code: { text },
  valueQuantity: { value: 1, unit: 'x' },
  effectiveDateTime: '2026-05-01T00:00:00Z',
})

function run(observations: any[]) {
  const { result } = renderHook(() =>
    useEncounterDetails([], [], observations, [], [], [], 'en', 'medical'),
  )
  return result.current.get('e1')!
}

describe('useEncounterDetails — clinical category grouping', () => {
  it('clusters interleaved CBC + biochem obs into ordered category groups', () => {
    // Deliberately interleaved: K (chem), RBC (cbc), Na (chem), WBC (cbc).
    const details = run([obs('o1', 'K'), obs('o2', 'RBC'), obs('o3', 'Na'), obs('o4', 'WBC')])

    // Two groups, cbc before chem (clinical reading order).
    expect(details.testGroups.map((g) => g.categoryId)).toEqual(['cbc', 'chem'])

    // Within cbc: WBC before RBC (preferredOrder). Within chem: Na before K.
    expect(details.testGroups[0].tests.map((t) => t.sortKey)).toEqual(['WBC', 'RBC'])
    expect(details.testGroups[1].tests.map((t) => t.sortKey)).toEqual(['NA', 'K'])
  })

  it('flat tests list is preserved for stats/search alongside groups', () => {
    const details = run([obs('o1', 'Na'), obs('o2', 'WBC')])
    expect(details.tests).toHaveLength(2)
    expect(details.testGroups.reduce((n, g) => n + g.tests.length, 0)).toBe(2)
  })

  it('tags each test with its category id for grouping', () => {
    const details = run([obs('o1', 'WBC')])
    expect(details.tests[0].categoryId).toBe('cbc')
    expect(details.tests[0].sortKey).toBe('WBC')
  })

  it('uncategorized tests fall into a trailing null group', () => {
    // A free-text / non-canonical row has no lab category.
    const details = run([obs('o1', 'WBC'), obs('o2', 'Aerobic culture, Sputum')])
    const ids = details.testGroups.map((g) => g.categoryId)
    expect(ids[0]).toBe('cbc')
    expect(ids[ids.length - 1]).toBeNull()
  })
})

describe('useEncounterDetails — medication quantity localization', () => {
  const medication = (overrides: Record<string, unknown> = {}) => ({
    id: 'm1',
    encounter: { reference: 'Encounter/e1' },
    medicationCodeableConcept: {
      text: '葉酸',
      coding: [{ display: 'Folic acid' }],
    },
    status: 'active',
    ...overrides,
  })

  const runMedications = (medications: any[], locale: string) => {
    const { result } = renderHook(() =>
      useEncounterDetails(medications, [], [], [], [], [], locale, 'medical'),
    )
    return result.current.get('e1')!
  }

  it('translates the common NHI dispensing sentence in the English UI', () => {
    const details = runMedications([
      medication({
        dosageInstruction: [{
          text: '給藥總量 28，給藥日數 28 天（平均每日 1）',
        }],
      }),
    ], 'en')

    expect(details.medications[0].detail)
      .toBe('Total quantity 28 · Days supplied 28 (avg. 1/day)')
  })

  it('keeps the original FHIR sentence in the Traditional Chinese UI', () => {
    const sourceText = '給藥總量 70，給藥日數 28 天（平均每日 2.5）'
    const details = runMedications([
      medication({ dosageInstruction: [{ text: sourceText }] }),
    ], 'zh-TW')

    expect(details.medications[0].detail).toBe(sourceText)
  })

  it('localizes the structured quantity fallback without inventing an average', () => {
    const details = runMedications([
      medication({
        dispenseRequest: {
          quantity: { value: 7 },
          expectedSupplyDuration: { value: 28 },
        },
      }),
    ], 'en')

    expect(details.medications[0].detail)
      .toBe('Total quantity 7 · Days supplied 28')
  })

  it('attaches the canonical medication row used by the dedicated medication tab', () => {
    const standardRow: MedicationRow = {
      id: 'm1',
      drugKey: 'AC49322100',
      title: 'BUPROPION HYDROCHLORIDE 150 MG',
      secondaryTitle: 'Official English name',
      status: 'active',
      isInactive: false,
      isChronic: true,
      category: '抗憂鬱劑',
      drugTerminology: {
        source: 'nhi-official-drug-master',
        snapshotId: 'nhi-drug-terminology-20260728',
        officialNameZh: '官方中文藥名',
        officialNameEn: 'Official English name',
        ingredientText: 'BUPROPION HYDROCHLORIDE 150 MG',
        atcCode: 'N06AX12',
      },
      refillCount: 1,
      searchHaystack: 'bupropion n06ax12 官方中文藥名',
    }
    const sourceMedication = medication({
      medicationCodeableConcept: {
        text: '來源中文藥名',
        coding: [{ code: 'AC49322100', display: 'Source English name' }],
      },
    })
    const { result } = renderHook(() =>
      useEncounterDetails(
        [sourceMedication],
        [],
        [],
        [],
        [],
        [],
        'zh-TW',
        'medical',
        [standardRow],
      ),
    )
    const encounterMedication = result.current.get('e1')!.medications[0]

    expect(encounterMedication.title).toBe('BUPROPION HYDROCHLORIDE 150 MG')
    expect(encounterMedication.isChronic).toBe(true)
    expect(encounterMedication.drugTerminology).toBe(standardRow.drugTerminology)
  })
})

// A narrative DiagnosticReport (EKG / imaging / endoscopy / pathology) carries
// its finding in `conclusion` with NO member observations — before the fix it
// produced zero rows and vanished from the visit despite the encounter link.
describe('useEncounterDetails — narrative reports (conclusion-only)', () => {
  const report = (over: any) => ({
    id: 'r1',
    encounter: { reference: 'Encounter/e1' },
    code: { text: '心電圖' },
    conclusion: 'Sinus bradycardia\nAbnormal ECG',
    effectiveDateTime: '2026-02-10T00:00:00Z',
    status: 'final',
    ...over,
  })
  const runReports = (reports: any[]) => {
    const { result } = renderHook(() =>
      useEncounterDetails([], reports, [], [], [], [], 'en', 'medical'),
    )
    return result.current.get('e1')!
  }

  it('surfaces an EKG (conclusion, no member obs) as a report row under the visit', () => {
    const details = runReports([report({})])
    expect(details.reports).toHaveLength(1)
    expect(details.reports[0]).toMatchObject({ title: '心電圖', conclusion: 'Sinus bradycardia\nAbnormal ECG' })
    expect(details.reports[0].row).toMatchObject({
      title: '心電圖',
      rawTitle: '心電圖',
      obs: [
        expect.objectContaining({
          code: { text: 'Report Summary' },
          valueString: 'Sinus bradycardia\nAbnormal ECG',
        }),
      ],
    })
    // It is NOT counted as a numeric test.
    expect(details.tests).toHaveLength(0)
  })

  it('surfaces an image-only report row so the shared report UI can show images', () => {
    const details = runReports([report({
      conclusion: '   ',
      presentedForm: [{ _imageRef: 'img-1', contentType: 'image/jpeg', title: 'preview.jpg', size: 1234 }],
    })])
    expect(details.reports).toHaveLength(1)
    expect(details.reports[0].row.images).toEqual([
      { ref: 'img-1', contentType: 'image/jpeg', title: 'preview.jpg', size: 1234 },
    ])
    expect(details.reports[0].row.obs[0]).toMatchObject({
      code: { text: 'Report Summary' },
      valueString: '',
    })
  })

  it('ignores a report with no conclusion (nothing to show)', () => {
    const details = runReports([report({ conclusion: '   ' })])
    expect(details.reports).toHaveLength(0)
  })

  it('deduplicates the same report id', () => {
    const details = runReports([report({}), report({})])
    expect(details.reports).toHaveLength(1)
  })
})
