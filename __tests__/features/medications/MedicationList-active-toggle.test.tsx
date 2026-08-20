import { fireEvent, render, screen } from '@testing-library/react'
import { MedicationList } from '@/features/clinical-summary/medications/components/MedicationList'
import type { MedicationRow } from '@/features/clinical-summary/medications/types'

const mockActiveMedication = {
  id: 'active-medication-1',
  title: 'ACETYLCYSTEINE 600 MG',
  status: 'active',
  isInactive: false,
  isChronic: false,
  searchHaystack: '',
} as MedicationRow

jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({
    t: {
      common: { loading: '載入中' },
      medications: {
        currentlyInUse: '使用中',
        noData: '無資料',
        history: '用藥歷史',
        historyStopped: '已停用',
        nameDisplay: {
          label: '藥名顯示方式',
          ingredient: '成分名',
          product: '商品名',
        },
      },
    },
  }),
}))

jest.mock('@/src/application/stores/resource-navigation.store', () => ({
  useResourceNavigationStore: (selector: (state: { pending: null; seq: number }) => unknown) =>
    selector({ pending: null, seq: 0 }),
}))

jest.mock('@/features/clinical-summary/medications/hooks/useGroupedMedications', () => ({
  useGroupedMedications: () => ({
    activeMedications: [mockActiveMedication],
    inactiveMedicationGroups: [],
  }),
}))

jest.mock('@/features/clinical-summary/medications/components/MedicationItem', () => ({
  MedicationItem: ({ medication }: { medication: MedicationRow }) => (
    <span>{medication.title}</span>
  ),
}))

jest.mock('@/features/clinical-summary/medications/components/MedicationHistoryList', () => ({
  MedicationHistoryList: () => null,
}))

describe('MedicationList active section toggle', () => {
  it('collapses and expands the current medication rows without hiding the name switch', () => {
    render(
      <MedicationList
        medications={[mockActiveMedication]}
        isLoading={false}
        error={null}
        showNameModeSwitch
        onNameModeChange={jest.fn()}
      />,
    )

    const toggle = screen.getByRole('button', { name: '使用中 (1)' })
    expect(toggle).toHaveClass('min-h-[32px]', 'md:min-h-8')
    expect(screen.getByRole('group', { name: '藥名顯示方式' })).toHaveClass(
      'min-h-[32px]',
      'md:min-h-8',
    )
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('ACETYLCYSTEINE 600 MG')).toBeInTheDocument()

    fireEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('ACETYLCYSTEINE 600 MG')).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: '藥名顯示方式' })).toBeInTheDocument()

    fireEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('ACETYLCYSTEINE 600 MG')).toBeInTheDocument()
  })
})
