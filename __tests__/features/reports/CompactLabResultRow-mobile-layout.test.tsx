import { render, screen } from '@testing-library/react'
import { CompactLabResultRow } from '@/features/clinical-summary/components/CompactLabResultRow'

describe('CompactLabResultRow mobile layout', () => {
  it('moves source metadata to a complete second line instead of clipping it', () => {
    render(
      <CompactLabResultRow
        title="BUN"
        value="23.7 mg/dL"
        abnormal
        afterValue={<span>參考範圍</span>}
        trailingContent={(
          <div>
            <span>示範長青醫院</span>
            <span>2026/6/2</span>
          </div>
        )}
      />,
    )

    const row = screen.getByText('BUN').closest('[role]')?.parentElement
      ?? screen.getByText('BUN').parentElement?.parentElement
    expect(row).toHaveClass(
      'grid',
      'grid-cols-[minmax(0,1fr)_auto]',
      'sm:flex',
      'overflow-hidden',
    )

    const source = screen.getByText('示範長青醫院').parentElement?.parentElement
    expect(source).toHaveClass('col-span-2', 'row-start-2', 'min-w-0', 'overflow-hidden', 'justify-start')
    expect(screen.getByText('23.7 mg/dL')).toBeInTheDocument()
    expect(screen.getByText('2026/6/2')).toBeInTheDocument()
  })

  it('shows ordinary reference ranges inline and reserves a tooltip for long ranges', () => {
    const { rerender } = render(
      <CompactLabResultRow title="GLUCOSE" value="124 mg/dL" referenceText="[70–99 mg/dL]" />,
    )

    expect(screen.getByTestId('reference-range-inline')).toHaveTextContent('[70–99 mg/dL]')
    expect(screen.queryByLabelText(/參考範圍/)).not.toBeInTheDocument()

    rerender(
      <CompactLabResultRow
        title="GLUCOSE"
        value="124 mg/dL"
        referenceText="[成人空腹 70–99；飯後兩小時 70–140 mg/dL]"
      />,
    )

    expect(screen.getByTestId('reference-range-truncated')).toBeInTheDocument()
    expect(screen.getByLabelText(/參考範圍/)).toBeInTheDocument()
  })
})
