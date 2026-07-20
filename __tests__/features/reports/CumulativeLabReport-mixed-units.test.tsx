import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { CumulativeLabReport } from '@/features/clinical-summary/reports/components/CumulativeLabReport'
import { LanguageProvider } from '@/src/application/providers/language.provider'
import { AudienceProvider } from '@/src/application/providers/audience.provider'

function TestProviders({ children }: { children: ReactNode }) {
  return (
    <LanguageProvider>
      <AudienceProvider>{children}</AudienceProvider>
    </LanguageProvider>
  )
}

describe('CumulativeLabReport mixed-unit fallback', () => {
  it('shows each cell unit instead of placing one incorrect unit in the column header', () => {
    const { container } = render(
      <CumulativeLabReport
        observations={[
          {
            id: 'hb-g-dl',
            code: { text: 'Hemoglobin', coding: [{ system: 'http://loinc.org', code: '718-7' }] },
            valueQuantity: { value: 13.2, unit: 'g/dL', code: 'g/dL', system: 'http://unitsofmeasure.org' },
            effectiveDateTime: '2026-01-02',
          },
          {
            id: 'hb-g-l',
            code: { text: 'Hemoglobin', coding: [{ system: 'http://loinc.org', code: '718-7' }] },
            valueQuantity: { value: 132, unit: 'g/L', code: 'g/L', system: 'http://unitsofmeasure.org' },
            effectiveDateTime: '2026-01-01',
          },
        ]}
      />,
      { wrapper: TestProviders },
    )

    const hbHeader = container.querySelector<HTMLElement>('[data-lab-test-key="HB"]')
    expect(hbHeader).not.toBeNull()
    expect(hbHeader).not.toHaveTextContent('g/dL')
    expect(hbHeader).not.toHaveTextContent('g/L')
    expect(screen.getByText('g/dL')).toBeInTheDocument()
    expect(screen.getByText('g/L')).toBeInTheDocument()
  })
})
