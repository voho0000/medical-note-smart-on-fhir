import { fireEvent, render, screen } from '@testing-library/react'
import { MedicationRemainingSupplyList } from '@/features/clinical-summary/medications/components/MedicationRemainingSupplyList'
import type { MedicationRemainingSummaryEntity } from '@/src/core/entities/clinical-data.entity'

jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({
    locale: 'zh-TW',
    t: {
      medications: {
        remainingSupplyTitle: '藥品餘藥日數',
        remainingSupplyDescription: '依健保雲端病歷近 90 日同成分同劑型領藥紀錄彙整。',
        sameIngredientEndDate: '同成分用藥結束日期',
        adherenceRemainingDays: '遵醫囑應餘用藥日數',
        remainingSupplyCapturedAt: '資料擷取時間',
        remainingSupplyStale: '擷取時資料，非今日即時值',
        relatedMedications: '查看相關用藥（{count}）',
      },
    },
  }),
}))

const summary: MedicationRemainingSummaryEntity = {
  id: 'remaining-1',
  atc5Name: 'THYROXINE',
  groupName: 'THYROXINE，一般錠劑膠囊劑',
  sameIngredientDosageFormEndDate: '2026-09-10',
  adherenceExpectedRemainingDays: 14,
  calculatedAt: '2026-08-28T10:00:00+08:00',
  relatedMedicationRequestReferences: [
    'MedicationRequest/med-1',
    'MedicationRequest/med-2',
  ],
  anchorMedicationRequestReference: 'MedicationRequest/med-1',
}

describe('MedicationRemainingSupplyList', () => {
  it('renders one Basic id as one same-ingredient summary and deduplicates repeats', () => {
    render(<MedicationRemainingSupplyList summaries={[summary, summary]} />)

    expect(screen.getByRole('heading', { name: '藥品餘藥日數 (1)' })).toBeInTheDocument()
    expect(screen.getByText('THYROXINE')).toBeInTheDocument()
    expect(screen.getByText('THYROXINE，一般錠劑膠囊劑')).toBeInTheDocument()
    expect(screen.getByText('2026/9/10')).toBeInTheDocument()
    expect(screen.getByText('14 天')).toBeInTheDocument()
  })

  it('navigates through the anchor without treating it as summary ownership', () => {
    const onViewRelated = jest.fn()
    render(
      <MedicationRemainingSupplyList
        summaries={[summary]}
        onViewRelated={onViewRelated}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '查看相關用藥（2）' }))
    expect(onViewRelated).toHaveBeenCalledWith(
      summary,
      'MedicationRequest/med-1',
    )
  })
})
