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

  it('prioritizes ingredient + strength and retains the product name for medical users', () => {
    const { result } = renderHook(() =>
      useMedicationRows([medication], 'medical', 'zh-TW'),
    )

    expect(result.current[0]).toMatchObject({
      title: 'BUPROPION HYDROCHLORIDE 150 MG',
      secondaryTitle: 'Official English name',
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

  it('does not replace a zh-TW patient source name with an English-only enrichment', () => {
    const englishOnlyTerminology = {
      ...medication,
      drugTerminology: {
        ...medication.drugTerminology,
        officialNameZh: undefined,
      },
    }
    const { result } = renderHook(() =>
      useMedicationRows([englishOnlyTerminology], 'patient', 'zh-TW'),
    )

    expect(result.current[0].title).toBe('來源中文藥名')
  })

  it('aggregates refill counts across package-code variants of one official product', () => {
    const productUrl =
      'https://lmspiq.fda.gov.tw/web/DRPIQ/DRPIQ1000Result?licId=01034670'
    const folicBase = {
      ...medication,
      medicationCodeableConcept: {
        text: '"強生"葉酸膜衣錠５毫克',
        coding: [{ code: 'AC34670100', display: 'FOLACIN F.C. TABLETS 5MG' }],
      },
      drugTerminology: {
        ...medication.drugTerminology,
        officialProductUrl: productUrl,
        ingredientText: 'FOLIC ACID 5 MG',
        doseForm: '膜衣錠',
      },
    }
    const packageVariant = {
      ...folicBase,
      id: 'mr-2',
      authoredOn: '2024-04-02',
      medicationCodeableConcept: {
        ...folicBase.medicationCodeableConcept,
        coding: [{ code: 'AC346701G0', display: 'FOLACIN F.C. TABLETS 5MG' }],
      },
    }

    const { result } = renderHook(() =>
      useMedicationRows([folicBase, packageVariant], 'medical', 'zh-TW'),
    )

    expect(result.current).toHaveLength(2)
    expect(result.current[0].drugKey).toBe(result.current[1].drugKey)
    expect(result.current[0].refillCount).toBe(2)
    expect(result.current[1].refillCount).toBe(2)
  })

  it('uses the exact source period end instead of adding the inclusive day count again', () => {
    const inpatientOrder = {
      ...medication,
      status: 'completed',
      authoredOn: '2025-05-20T00:00:00+08:00',
      dispenseRequest: {
        validityPeriod: {
          start: '2025-05-20T00:00:00+08:00',
          end: '2025-05-21T23:59:59+08:00',
        },
      },
    }

    const { result } = renderHook(() =>
      useMedicationRows([inpatientOrder], 'medical', 'zh-TW'),
    )

    expect(result.current[0].durationDays).toBe(2)
    expect(result.current[0].endDate).toBe(
      new Date(inpatientOrder.dispenseRequest.validityPeriod.end).toLocaleDateString(),
    )
  })
})
