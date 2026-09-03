import { act, render, screen } from '@testing-library/react'
import { DataSelectionDrawer } from '@/features/data-selection/components/DataSelectionDrawer'

const mockFeature = jest.fn()
jest.mock('@/features/data-selection/Feature', () => ({ DataSelectionFeature: (props: unknown) => {
  mockFeature(props)
  return <div>scope controls</div>
} }))
jest.mock('@/src/application/providers/language.provider', () => ({ useLanguage: () => ({ t: { dataSelection: { loadingData: '準備資料範圍…' } } }) }))

describe('data selection drawer first paint', () => {
  beforeEach(() => { jest.useFakeTimers(); mockFeature.mockClear() })
  afterEach(() => { jest.useRealTimers() })
  const props = { title: 'AI 資料範圍', description: 'scope description', onOpenChange: jest.fn() }

  it('shows the dialog and close control before any heavy chart work', () => {
    render(<DataSelectionDrawer {...props} open />)
    expect(screen.getByRole('dialog', { name: 'AI 資料範圍' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close' })).toBeEnabled()
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')
    expect(mockFeature).not.toHaveBeenCalled()
    act(() => { jest.advanceTimersByTime(50) })
    expect(screen.getByText('scope controls')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('cancels a closed drawer and starts cleanly on reopening', () => {
    const { rerender } = render(<DataSelectionDrawer {...props} open />)
    rerender(<DataSelectionDrawer {...props} open={false} />)
    act(() => { jest.advanceTimersByTime(50) })
    expect(mockFeature).not.toHaveBeenCalled()
    rerender(<DataSelectionDrawer {...props} open />)
    expect(mockFeature).not.toHaveBeenCalled()
    act(() => { jest.advanceTimersByTime(50) })
    expect(screen.getByText('scope controls')).toBeInTheDocument()
  })
})
