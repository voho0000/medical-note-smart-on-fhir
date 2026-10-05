// 慢箋 belongs to the drug across its whole history. The overview builds rows
// for its window only, and a window holding only a drug's non-chronic refills
// must not un-mark it — the 用藥 tab and 複製現在用藥 both rely on it.
import { renderHook } from '@testing-library/react'
import { useOverviewMeds } from '@/features/clinical-summary/overview/hooks/useOverviewMeds'
import { buildOverviewWindow } from '@/features/clinical-summary/overview/utils/overview-selectors'

const NOW = Date.parse('2026-10-03T09:00:00+08:00')
jest.mock('@/src/shared/hooks/use-now.hook', () => ({ useNow: () => NOW }))

function refill(id: string, authoredOn: string, chronic: boolean) {
  return {
    resourceType: 'MedicationRequest',
    id,
    status: 'active',
    intent: 'order',
    authoredOn,
    medicationCodeableConcept: { text: 'LATANOPROST 50 MCG/ML', coding: [{ system: 'https://twcore.mohw.gov.tw/CodeSystem/nhi-drug-code', code: 'X1' }] },
    ...(chronic ? { courseOfTherapyType: { coding: [{ code: 'continuous' }] } } : {}),
    dispenseRequest: { expectedSupplyDuration: { value: 28, unit: 'days', code: 'd' } },
  }
}

it('keeps a drug 慢箋 when only an older refill outside the window was marked chronic', () => {
  const medications = [
    refill('old', '2026-04-20T00:00:00+08:00', true),
    refill('latest', '2026-09-20T00:00:00+08:00', false),
  ]
  const { result } = renderHook(() => useOverviewMeds(medications, buildOverviewWindow(3, NOW), 'medical', 'zh-TW'))
  const current = result.current.meds.items.filter((item) => item.isCurrent)
  expect(current).toHaveLength(1)
  expect(current[0].id).toBe('latest')
  expect(current[0].isChronic).toBe(true)
})
