import { act, fireEvent, render, screen } from '@testing-library/react'
import {
  MedicalSummaryCardNav,
  type MedicalSummaryCardNavItem,
} from '@/features/medical-summary/components/MedicalSummaryCardNav'

const items: MedicalSummaryCardNavItem[] = [
  {
    id: 'investigations',
    label: '檢查趨勢',
    compactLabel: '檢查',
    description: '關鍵檢驗與檢查趨勢',
    count: 3,
  },
  {
    id: 'problems',
    label: '健康狀況',
    compactLabel: '健康',
    description: '目前健康狀況',
    count: 0,
  },
  { id: 'medications', label: '用藥', compactLabel: '用藥', description: '我的用藥與照護', count: 4 },
]

describe('MedicalSummaryCardNav', () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  it('renders every visible card in the supplied layout order, including zero counts', () => {
    render(<MedicalSummaryCardNav items={items} ariaLabel="摘要卡片導覽" onJump={() => {}} />)

    const nav = screen.getByRole('navigation', { name: '摘要卡片導覽' })
    const scroller = screen.getByTestId('medical-summary-card-nav-scroller')
    const layout = scroller.parentElement
    const buttons = Array.from(nav.querySelectorAll('button'))
    expect(nav).toHaveClass('sticky', 'top-0')
    expect(nav).not.toHaveClass('overflow-x-auto')
    expect(scroller).toHaveClass('overflow-x-auto')
    expect(scroller).toHaveClass('min-w-0', 'flex-1')
    expect(layout).toHaveClass('flex-nowrap')
    expect(layout).not.toHaveClass('flex-wrap')
    expect(buttons.map((button) => button.textContent)).toEqual(['檢查3', '健康0', '用藥4'])
    expect(buttons[0]).toHaveAccessibleName('檢查趨勢 3')
    expect(buttons[0]).toHaveAttribute('title', '關鍵檢驗與檢查趨勢')
    expect(buttons[0]).toHaveAttribute('aria-controls', 'medical-summary-card-investigations')
    expect(screen.queryByTestId('medical-summary-generation-meta')).not.toBeInTheDocument()
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

  it('keeps generation provenance fixed at the far right outside the chip scroller', () => {
    render(
      <MedicalSummaryCardNav
        items={items}
        ariaLabel="摘要卡片導覽"
        onJump={() => {}}
        generationInfo={{
          modelName: 'MODEL_NAME',
          generatedAtIso: '2026-07-19T06:32:00.000Z',
          generatedAtText: '2026/07/19 14:32',
          durationLabel: '耗時',
          durationText: '01:23',
          ariaLabel: '由 MODEL_NAME 於 2026/07/19 14:32 產生，總耗時 01:23',
        }}
      />,
    )

    const scroller = screen.getByTestId('medical-summary-card-nav-scroller')
    const provenance = screen.getByTestId('medical-summary-generation-meta')
    expect(scroller).not.toContainElement(provenance)
    expect(provenance).toHaveClass('ml-auto', 'max-w-[48%]')
    expect(provenance).not.toHaveClass('max-w-full')
    expect(provenance).toHaveTextContent('MODEL_NAME·2026/07/19 14:32·耗時 01:23')
    expect(provenance).toHaveAttribute(
      'aria-label',
      '由 MODEL_NAME 於 2026/07/19 14:32 產生，總耗時 01:23',
    )
    expect(provenance.querySelector('time')).toHaveAttribute(
      'datetime',
      '2026-07-19T06:32:00.000Z',
    )
  })

  it('shows the immutable running model and elapsed time, then clears its timer', () => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-07-20T01:00:00.000Z'))
    const { unmount } = render(
      <MedicalSummaryCardNav
        items={items}
        ariaLabel="摘要卡片導覽"
        onJump={() => {}}
        activeGeneration={{
          id: 'batch-1',
          modelName: 'MODEL_NAME',
          startedAt: Date.now(),
        }}
        runningLabel="產生中"
        runningAriaTemplate="正在使用 {model} 產生摘要，已進行 {elapsed}"
      />,
    )

    const provenance = screen.getByTestId('medical-summary-generation-meta')
    expect(provenance).toHaveTextContent('產生中·MODEL_NAME·00:00')

    act(() => jest.advanceTimersByTime(61_000))

    expect(provenance).toHaveTextContent('產生中·MODEL_NAME·01:01')
    expect(provenance).toHaveAttribute(
      'aria-label',
      '正在使用 MODEL_NAME 產生摘要，已進行 01:01',
    )

    unmount()
    expect(jest.getTimerCount()).toBe(0)
    jest.useRealTimers()
  })

  it('shows pre-generated provenance without a fake date', () => {
    render(
      <MedicalSummaryCardNav
        items={items}
        ariaLabel="摘要卡片導覽"
        onJump={() => {}}
        generationInfo={{
          prefix: '預產生',
          modelName: 'Gemini 3.1 Flash-Lite',
          ariaLabel: '預產生摘要，由 Gemini 3.1 Flash-Lite 建立',
        }}
      />,
    )

    const provenance = screen.getByTestId('medical-summary-generation-meta')
    expect(provenance).toHaveTextContent('預產生·Gemini 3.1 Flash-Lite')
    expect(provenance.querySelector('time')).not.toBeInTheDocument()
  })

  it('renders nothing when there are no visible cards', () => {
    const { container } = render(
      <MedicalSummaryCardNav items={[]} ariaLabel="摘要卡片導覽" onJump={() => {}} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
