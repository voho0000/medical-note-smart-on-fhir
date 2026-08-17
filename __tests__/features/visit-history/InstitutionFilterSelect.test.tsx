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

    fireEvent.keyDown(trigger, { key: 'ArrowDown' })

    expect(screen.getByRole('option', { name: fhirInstitution })).toBeInTheDocument()
  })
})
