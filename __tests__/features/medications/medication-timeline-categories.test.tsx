import { renderHook } from '@testing-library/react'
import { useMedicationTimeline } from '@/features/clinical-summary/medications/timeline/hooks/useMedicationTimeline'

const zhAtcCategories = {
  C: '心血管系統',
  R: '呼吸系統',
}

function medication(overrides: Record<string, unknown> = {}) {
  return {
    resourceType: 'MedicationRequest',
    id: 'med-1',
    status: 'active',
    authoredOn: '2026-07-01',
    medicationCodeableConcept: {
      coding: [{ code: 'AC49322100', display: 'ACETYLCYSTEINE 600 MG' }],
      text: '愛克痰發泡錠600毫克',
    },
    dispenseRequest: {
      expectedSupplyDuration: { value: 14, unit: 'days' },
    },
    drugTerminology: {
      officialNameZh: '愛克痰發泡錠600毫克',
      officialNameEn: 'ACTEIN EFFERVESCENT TABLETS 600MG',
      ingredientText: 'ACETYLCYSTEINE 600 MG',
      atcCode: 'R05CB01',
      atcLevel2Code: 'R05',
      atcLevel2NameEn: 'COUGH AND COLD PREPARATIONS',
      atcLevel2NameZh: '咳嗽與感冒製劑',
    },
    ...overrides,
  }
}

describe('useMedicationTimeline category grouping', () => {
  it('separates SDK medications by governed ATC level two', () => {
    const medications = [
      medication(),
      medication({
        id: 'med-2',
        medicationCodeableConcept: {
          coding: [{ code: 'RESP-2', display: 'RESPIRATORY DRUG' }],
          text: '另一種呼吸系統用藥',
        },
        drugTerminology: {
          officialNameZh: '另一種呼吸系統用藥',
          officialNameEn: 'ANOTHER RESPIRATORY DRUG',
          atcCode: 'R03AC02',
          atcLevel2Code: 'R03',
          atcLevel2NameEn: 'DRUGS FOR OBSTRUCTIVE AIRWAY DISEASES',
          atcLevel2NameZh: '阻塞性呼吸道疾病用藥',
        },
      }),
    ]

    const { result } = renderHook(() =>
      useMedicationTimeline(
        medications,
        'patient',
        'all',
        '其他',
        'zh-TW',
        zhAtcCategories,
      ),
    )

    expect(result.current.categories).toHaveLength(2)
    expect(result.current.categories.map(({ key, label }) => ({ key, label })))
      .toEqual([
        {
          key: 'atc-level2:R03',
          label: '阻塞性呼吸道疾病用藥',
        },
        {
          key: 'atc-level2:R05',
          label: '咳嗽與感冒製劑',
        },
      ])
  })

  it('keeps ATC grouping consistent even when a source category is present', () => {
    const medications = [
      medication({
        category: [{
          coding: [{ code: 'mucolytic', display: 'Mucolytics' }],
          text: '祛痰藥',
        }],
      }),
    ]

    const { result } = renderHook(() =>
      useMedicationTimeline(
        medications,
        'patient',
        'all',
        '其他',
        'zh-TW',
        zhAtcCategories,
      ),
    )

    expect(result.current.categories).toHaveLength(1)
    expect(result.current.categories[0]).toMatchObject({
      key: 'atc-level2:R05',
      label: '咳嗽與感冒製劑',
    })
  })

  it('falls back to the source category when ATC is unavailable', () => {
    const medications = [
      medication({
        drugTerminology: undefined,
        category: [{
          coding: [{ code: 'mucolytic', display: 'Mucolytics' }],
          text: '祛痰藥',
        }],
      }),
    ]

    const { result } = renderHook(() =>
      useMedicationTimeline(
        medications,
        'patient',
        'all',
        '其他',
        'zh-TW',
        zhAtcCategories,
      ),
    )

    expect(result.current.categories[0]).toMatchObject({
      key: 'source:mucolytic',
      label: '祛痰藥',
    })
  })

  it('prefers a source category over broad level one when level two is unavailable', () => {
    const medications = [
      medication({
        drugTerminology: { atcCode: 'R05CB01' },
        category: [{
          coding: [{ code: 'mucolytic', display: 'Mucolytics' }],
          text: '祛痰藥',
        }],
      }),
    ]

    const { result } = renderHook(() =>
      useMedicationTimeline(
        medications,
        'patient',
        'all',
        '其他',
        'zh-TW',
        zhAtcCategories,
      ),
    )

    expect(result.current.categories[0]).toMatchObject({
      key: 'source:mucolytic',
      label: '祛痰藥',
    })
  })

  it('falls back to ATC level one only when level two and source category are absent', () => {
    const medications = [
      medication({ drugTerminology: { atcCode: 'R05CB01' } }),
    ]

    const { result } = renderHook(() =>
      useMedicationTimeline(
        medications,
        'patient',
        'all',
        '其他',
        'zh-TW',
        zhAtcCategories,
      ),
    )

    expect(result.current.categories[0]).toMatchObject({
      key: 'atc-level1:R',
      label: '呼吸系統',
    })
  })

  it('uses Other only when level two, source category, and valid ATC are absent', () => {
    const medications = [
      medication({ drugTerminology: undefined }),
    ]

    const { result } = renderHook(() =>
      useMedicationTimeline(
        medications,
        'patient',
        'all',
        '其他',
        'zh-TW',
        zhAtcCategories,
      ),
    )

    expect(result.current.categories[0]).toMatchObject({
      key: '__other__',
      label: '其他',
    })
  })

  it('uses ingredient + strength as the compact medical timeline label', () => {
    const { result } = renderHook(() =>
      useMedicationTimeline(
        [medication()],
        'medical',
        'all',
        'Other',
        'en',
        { R: 'Respiratory system' },
      ),
    )

    expect(result.current.drugs[0]).toMatchObject({
      drugName: 'ACETYLCYSTEINE 600 MG',
      drugProductName: 'ACTEIN EFFERVESCENT TABLETS 600MG',
    })
  })

  it('uses the official English level two name in an English UI', () => {
    const { result } = renderHook(() =>
      useMedicationTimeline(
        [medication()],
        'medical',
        'all',
        'Other',
        'en',
        { R: 'Respiratory system' },
      ),
    )

    expect(result.current.categories[0]).toMatchObject({
      key: 'atc-level2:R05',
      label: 'COUGH AND COLD PREPARATIONS',
    })
  })

  it('puts package-code variants of the same official product on one drug row', () => {
    const folicTerminology = {
      officialNameZh: '"強生"葉酸膜衣錠５毫克',
      officialNameEn: 'FOLACIN F.C. TABLETS 5MG (FOLIC ACID) "JOHNSON"',
      ingredientText: 'FOLIC ACID 5 MG',
      doseForm: '膜衣錠',
      atcCode: 'B03BB01',
      atcLevel2Code: 'B03',
      atcLevel2NameEn: 'ANTIANEMIC PREPARATIONS',
      atcLevel2NameZh: '抗貧血製劑',
      officialProductUrl:
        'https://lmspiq.fda.gov.tw/web/DRPIQ/DRPIQ1000Result?licId=01034670',
    }
    const medications = [
      medication({
        id: 'folic-00',
        authoredOn: '2026-06-02',
        medicationCodeableConcept: {
          coding: [{ code: 'AC34670100', display: 'FOLACIN F.C. TABLETS 5MG' }],
          text: '"強生"葉酸膜衣錠５毫克',
        },
        drugTerminology: folicTerminology,
      }),
      medication({
        id: 'folic-g0',
        authoredOn: '2026-06-25',
        medicationCodeableConcept: {
          coding: [{ code: 'AC346701G0', display: 'FOLACIN F.C. TABLETS 5MG' }],
          text: '"強生"葉酸膜衣錠５毫克',
        },
        drugTerminology: folicTerminology,
      }),
    ]

    const { result } = renderHook(() =>
      useMedicationTimeline(
        medications,
        'medical',
        'all',
        'Other',
        'en',
        {},
      ),
    )

    expect(result.current.totalDrugs).toBe(1)
    expect(result.current.drugs[0].refillCount).toBe(2)
    expect(result.current.drugs[0].bars).toHaveLength(2)
    expect(result.current.drugs[0].bars.map((bar) => bar.sourceMedicationCode))
      .toEqual(['AC34670100', 'AC346701G0'])
  })

  it('keeps same-ingredient products with different official licences separate', () => {
    const commonTerminology = {
      officialNameEn: 'FOLIC ACID TABLETS 5MG',
      ingredientText: 'FOLIC ACID 5 MG',
      doseForm: '膜衣錠',
      atcCode: 'B03BB01',
      atcLevel2Code: 'B03',
      atcLevel2NameEn: 'ANTIANEMIC PREPARATIONS',
      atcLevel2NameZh: '抗貧血製劑',
    }
    const medications = [
      medication({
        id: 'product-a',
        medicationCodeableConcept: {
          coding: [{ code: 'NHI-A', display: 'FOLIC ACID A' }],
          text: '葉酸 A',
        },
        drugTerminology: {
          ...commonTerminology,
          officialProductUrl: 'https://example.test/licence/A',
        },
      }),
      medication({
        id: 'product-b',
        medicationCodeableConcept: {
          coding: [{ code: 'NHI-B', display: 'FOLIC ACID B' }],
          text: '葉酸 B',
        },
        drugTerminology: {
          ...commonTerminology,
          officialProductUrl: 'https://example.test/licence/B',
        },
      }),
    ]

    const { result } = renderHook(() =>
      useMedicationTimeline(
        medications,
        'medical',
        'all',
        'Other',
        'en',
        {},
      ),
    )

    expect(result.current.totalDrugs).toBe(2)
  })
})
