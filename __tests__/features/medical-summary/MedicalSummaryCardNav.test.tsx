import { fireEvent, render, screen } from '@testing-library/react'
import {
  MedicalSummaryCardNav,
  type MedicalSummaryCardNavItem,
} from '@/features/medical-summary/components/MedicalSummaryCardNav'

const items: MedicalSummaryCardNavItem[] = [
  { id: 'investigations', label: '檢查趨勢', description: '關鍵檢驗與檢查趨勢', count: 3 },
  { id: 'problems', label: '健康狀況', description: '目前健康狀況', count: 0 },
  { id: 'medications', label: '用藥', description: '我的用藥與照護', count: 4 },
]

describe('MedicalSummaryCardNav', () => {
  it('renders every visible card in the supplied layout order, including zero counts', () => {
    render(<MedicalSummaryCardNav items={items} ariaLabel="摘要卡片導覽" onJump={() => {}} />)

    const nav = screen.getByRole('navigation', { name: '摘要卡片導覽' })
    const scroller = screen.getByTestId('medical-summary-card-nav-scroller')
    const buttons = Array.from(nav.querySelectorAll('button'))
    expect(nav).toHaveClass('sticky', 'top-0')
    expect(nav).not.toHaveClass('overflow-x-auto')
    expect(scroller).toHaveClass('overflow-x-auto')
    expect(buttons.map((button) => button.textContent)).toEqual(['檢查趨勢3', '健康狀況0', '用藥4'])
    expect(buttons[0]).toHaveAttribute('title', '關鍵檢驗與檢查趨勢')
    expect(buttons[0]).toHaveAttribute('aria-controls', 'medical-summary-card-investigations')
  })

  it('reports the selected card id when a chip is clicked', () => {
    const onJump = jest.fn()
    render(<MedicalSummaryCardNav items={items} ariaLabel="摘要卡片導覽" onJump={onJump} />)

    fireEvent.click(screen.getByRole('button', { name: '用藥 4' }))
    expect(onJump).toHaveBeenCalledWith('medications')
  })

  it('marks the card currently in view without marking the other chips', () => {
    render(
      <MedicalSummaryCardNav
        items={items}
        ariaLabel="摘要卡片導覽"
        activeId="problems"
        onJump={() => {}}
      />,
    )

    expect(screen.getByRole('button', { name: '健康狀況 0' })).toHaveAttribute(
      'aria-current',
      'location',
    )
    expect(screen.getByRole('button', { name: '檢查趨勢 3' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('button', { name: '用藥 4' })).not.toHaveAttribute('aria-current')
  })

  it('renders nothing when there are no visible cards', () => {
    const { container } = render(
      <MedicalSummaryCardNav items={[]} ariaLabel="摘要卡片導覽" onJump={() => {}} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
