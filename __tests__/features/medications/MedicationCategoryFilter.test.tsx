import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import {
  MedicationCategoryFilter,
  type MedicationCategoryOption,
} from '@/features/clinical-summary/medications/components/MedicationCategoryFilter'

const OPTIONS: MedicationCategoryOption[] = [
  { value: '抗血小板藥', label: '抗血小板藥', count: 2, priority: true },
  { value: '呼吸系統用藥', label: '呼吸系統用藥', count: 4 },
  { value: '心血管用藥', label: '心血管用藥', count: 7 },
]

function Fixture() {
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  return (
    <MedicationCategoryFilter
      label="藥理類別"
      clearLabel="清除全部"
      selectedCountLabel="已選 {count}"
      priorityGroupLabel="凝血／手術注意"
      otherGroupLabel="其他類別"
      searchPlaceholder="搜尋類別…"
      searchClearLabel="清除類別搜尋"
      noMatchesLabel="找不到符合的類別"
      options={OPTIONS}
      selected={selected}
      onSelectedChange={setSelected}
    />
  )
}

describe('MedicationCategoryFilter', () => {
  it('supports selecting multiple pharmacologic categories and clearing them', () => {
    render(<Fixture />)

    fireEvent.click(screen.getByRole('button', { name: '藥理類別' }))
    expect(screen.getByRole('region', { name: '凝血／手術注意' }))
      .toHaveTextContent('抗血小板藥')
    expect(screen.getByRole('region', { name: '其他類別' }))
      .toHaveTextContent('呼吸系統用藥')
    fireEvent.click(screen.getByRole('checkbox', { name: '呼吸系統用藥' }))
    fireEvent.click(screen.getByRole('checkbox', { name: '心血管用藥' }))

    expect(screen.getByRole('button', { name: '藥理類別' })).toHaveTextContent('已選 2')
    expect(screen.getByRole('checkbox', { name: '呼吸系統用藥' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: '心血管用藥' })).toBeChecked()

    fireEvent.click(screen.getByRole('button', { name: '清除全部' }))
    expect(screen.getByRole('checkbox', { name: '呼吸系統用藥' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: '心血管用藥' })).not.toBeChecked()
  })

  it('filters category names while preserving priority grouping', () => {
    render(<Fixture />)

    fireEvent.click(screen.getByRole('button', { name: '藥理類別' }))
    fireEvent.change(screen.getByRole('searchbox', { name: '搜尋類別…' }), {
      target: { value: '抗血小板' },
    })

    expect(screen.getByRole('region', { name: '凝血／手術注意' }))
      .toHaveTextContent('抗血小板藥')
    expect(screen.queryByRole('region', { name: '其他類別' })).not.toBeInTheDocument()

    fireEvent.change(screen.getByRole('searchbox', { name: '搜尋類別…' }), {
      target: { value: '不存在' },
    })
    expect(screen.getByRole('status')).toHaveTextContent('找不到符合的類別')
  })
})
