import { renderHook } from '@testing-library/react'
import { useMedicationRows } from '@/features/clinical-summary/medications/hooks/useMedicationRows'

const medication = {
  resourceType: 'MedicationRequest',
  id: 'mr-1',
  status: 'active',
  authoredOn: '2024-04-01',
  medicationCodeableConcept: {
    text: '來源中文藥名',
    coding: [{
      system: 'https://twcore.mohw.gov.tw/CodeSystem/nhi-drug-code',
      code: 'AC49322100',
      display: 'Source English name',
    }],
  },
  drugTerminology: {
    source: 'nhi-official-drug-master',
    snapshotId: 'nhi-drug-terminology-20260728',
    officialNameZh: '官方中文藥名',
    officialNameEn: 'Official English name',
    ingredientText: 'BUPROPION HYDROCHLORIDE 150 MG',
    doseForm: '持續性藥效膜衣錠',
    atcCode: 'N06AX12',
    atcNameEn: 'bupropion',
  },
}

describe('useMedicationRows — official NHI terminology view model', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2024-04-02T00:00:00Z'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('shows the official English name to medical users and searches all enriched fields', () => {
    const { result } = renderHook(() =>
      useMedicationRows([medication], 'medical', 'zh-TW'),
    )

    expect(result.current[0]).toMatchObject({
      title: 'Official English name',
      drugTerminology: medication.drugTerminology,
    })
    expect(result.current[0].searchHaystack).toEqual(
      expect.stringContaining('官方中文藥名'),
    )
    expect(result.current[0].searchHaystack).toEqual(
      expect.stringContaining('bupropion hydrochloride 150 mg'),
    )
    expect(result.current[0].searchHaystack).toEqual(
      expect.stringContaining('n06ax12'),
    )
  })

  it('shows the official Chinese name to a zh-TW patient audience', () => {
    const { result } = renderHook(() =>
      useMedicationRows([medication], 'patient', 'zh-TW'),
    )

    expect(result.current[0].title).toBe('官方中文藥名')
  })
})
