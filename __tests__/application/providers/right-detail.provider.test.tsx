import { fireEvent, render, screen } from '@testing-library/react'
import {
  RightDetailProvider,
  useRightDetail,
} from '@/src/application/providers/right-detail.provider'

function RightDetailHarness() {
  const { detail, showDetail, toggleDetail, clearDetail } = useRightDetail()
  const first = { sourceId: 'first', title: 'First', node: <p>First detail</p> }
  const second = { sourceId: 'second', title: 'Second', node: <p>Second detail</p> }

  return (
    <div>
      <output data-testid="right-detail-source">{detail?.sourceId ?? 'none'}</output>
      <button type="button" onClick={() => showDetail(first)}>Show first</button>
      <button type="button" onClick={() => toggleDetail(first)}>Toggle first</button>
      <button type="button" onClick={() => toggleDetail(second)}>Toggle second</button>
      <button type="button" onClick={clearDetail}>Clear detail</button>
    </div>
  )
}

describe('RightDetailProvider docking behavior', () => {
  it('shows, switches, toggles closed, and clears right-pane content', () => {
    render(
      <RightDetailProvider>
        <RightDetailHarness />
      </RightDetailProvider>,
    )

    expect(screen.getByTestId('right-detail-source')).toHaveTextContent('none')

    fireEvent.click(screen.getByRole('button', { name: 'Show first' }))
    expect(screen.getByTestId('right-detail-source')).toHaveTextContent('first')

    fireEvent.click(screen.getByRole('button', { name: 'Toggle second' }))
    expect(screen.getByTestId('right-detail-source')).toHaveTextContent('second')

    fireEvent.click(screen.getByRole('button', { name: 'Toggle second' }))
    expect(screen.getByTestId('right-detail-source')).toHaveTextContent('none')

    fireEvent.click(screen.getByRole('button', { name: 'Toggle first' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear detail' }))
    expect(screen.getByTestId('right-detail-source')).toHaveTextContent('none')
  })
})
