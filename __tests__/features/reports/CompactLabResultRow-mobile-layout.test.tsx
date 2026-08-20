import { render, screen } from '@testing-library/react'
import { CompactLabResultRow } from '@/features/clinical-summary/components/CompactLabResultRow'

describe('CompactLabResultRow mobile layout', () => {
  it('keeps source metadata on a second line by default', () => {
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

  it('uses an adaptive wrapping row without letting metadata compress the title', () => {
    render(
      <CompactLabResultRow
        title="BUN"
        value="23.7 mg/dL"
        referenceText="[8–20 mg/dL]"
        adaptivePhoneLayout
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
    expect(row).toHaveClass('min-[380px]:flex', 'min-[380px]:flex-wrap')

    const title = screen.getByText('BUN').closest('[data-testid="compact-lab-title"]')
    expect(title).toHaveClass('min-[380px]:min-w-[3.75rem]', 'min-[380px]:flex-1')

    const source = screen.getByText('示範長青醫院').closest('[data-testid="compact-lab-meta"]')
    expect(source).toHaveClass(
      'min-[380px]:col-auto',
      'min-[380px]:row-auto',
      'min-[380px]:ml-auto',
      'min-[380px]:shrink-0',
    )
  })

  it('never lets the value + reference range shrink under the source metadata', () => {
    // Regression: the cluster was `min-w-0 sm:flex-1`, so from 640px up it
    // collapsed to a 0 basis and its unshrinkable children (a short value is
    // shrink-0, an inline range is whitespace-nowrap) painted straight over the
    // institution/date cluster. It must hug its content instead, which also
    // restores the wrap this adaptive layout depends on.
    render(
      <CompactLabResultRow
        title="AFP"
        value="1.24 ng/mL"
        referenceText="[0–3.99 ng/mL]"
        adaptivePhoneLayout
        trailingContent={<span>示範長青醫院</span>}
      />,
    )

    const valueCluster = screen.getByTestId('compact-lab-value')
    expect(valueCluster).toHaveClass('min-[380px]:flex-none')
    expect(valueCluster).not.toHaveClass('min-w-0')
    expect(valueCluster).not.toHaveClass('sm:flex-1')
    // The meta cluster stays the one that gives way — it clips rather than
    // letting anything overlap.
    expect(screen.getByTestId('compact-lab-meta')).toHaveClass('overflow-hidden')
  })

  it('keeps the non-adaptive row filling its value column', () => {
    render(<CompactLabResultRow title="Na" value="140 mmol/L" />)

    const valueCluster = screen.getByTestId('compact-lab-value')
    expect(valueCluster).toHaveClass('sm:flex-1', 'sm:justify-start')
    expect(valueCluster).not.toHaveClass('min-w-0')
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
