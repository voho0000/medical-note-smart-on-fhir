import { fireEvent, render, screen } from '@testing-library/react'
import { InstitutionFilterSelect } from '@/features/clinical-summary/visit-history/components/InstitutionFilterSelect'

describe('InstitutionFilterSelect', () => {
  beforeAll(() => {
    Object.defineProperties(HTMLElement.prototype, {
      hasPointerCapture: { configurable: true, value: () => false },
      setPointerCapture: { configurable: true, value: () => undefined },
      releasePointerCapture: { configurable: true, value: () => undefined },
      scrollIntoView: { configurable: true, value: () => undefined },
    })
  })

  it('shows the unchanged full FHIR institution name when opened', () => {
    const fhirInstitution = '臺北榮民總醫院；門診醫療部影像中心'

    render(
      <InstitutionFilterSelect
        value={fhirInstitution}
        institutions={[fhirInstitution]}
        allLabel="所有機構"
        onValueChange={() => undefined}
      />,
    )

    const trigger = screen.getByRole('combobox', { name: '所有機構' })
    expect(trigger).toHaveTextContent(fhirInstitution)
    expect(trigger).toHaveAttribute('title', fhirInstitution)
    // Phone: a single fixed 5.25rem box — narrower than the old 7rem so the
    // content chips in the filter strip get the freed width, fixed so the strip
    // never reflows between the unfiltered 機構 label and a selected
    // institution, and rem-based so it scales with the user-settable root
    // font-size instead of truncating the label (font-size.provider.tsx).
    // The exact value is measured: it lands the strip at 305px @ root 12/375px.
    // min-h stays literal px: it's the touch-target floor, not type-driven.
    // md+ keeps the original fixed 7rem column.
    expect(trigger).toHaveClass(
      'min-h-[36px]',
      'w-[5.25rem]',
      'min-w-[5.25rem]',
      'max-w-[5.25rem]',
      'md:min-h-7',
      'md:w-28',
      'md:min-w-28',
      'md:max-w-28',
    )
    expect(trigger).not.toHaveClass('w-[112px]')

    fireEvent.keyDown(trigger, { key: 'ArrowDown' })

    expect(screen.getByRole('option', { name: fhirInstitution })).toBeInTheDocument()
  })
})
