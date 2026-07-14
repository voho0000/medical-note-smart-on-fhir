import { render, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { CumulativeLabReport } from '@/features/clinical-summary/reports/components/CumulativeLabReport'
import { LanguageProvider } from '@/src/application/providers/language.provider'
import { AudienceProvider } from '@/src/application/providers/audience.provider'
import type { ObservationEntity } from '@/src/core/entities/clinical-data.entity'

const crp: ObservationEntity = {
  id: 'obs-crp',
  code: {
    coding: [{ system: 'http://loinc.org', code: '1988-5', display: 'C-reactive protein' }],
  },
  effectiveDateTime: '2026-06-17',
  valueQuantity: { value: 2.47, unit: 'mg/dL' },
}

function TestProviders({ children }: { children: ReactNode }) {
  return (
    <LanguageProvider>
      <AudienceProvider>{children}</AudienceProvider>
    </LanguageProvider>
  )
}

describe('CumulativeLabReport analyte focus', () => {
  const scrollTo = jest.fn()

  beforeEach(() => {
    scrollTo.mockClear()
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    })
  })

  it('reveals and highlights the requested CRP column', async () => {
    const { container, rerender } = render(
      <CumulativeLabReport
        observations={[crp]}
        activeCategoryId="chem"
        focusAnalyteKey="CRP"
        focusNonce={7}
      />,
      { wrapper: TestProviders },
    )

    const crpHeader = container.querySelector<HTMLElement>('[data-lab-test-key="CRP"]')
    expect(crpHeader).not.toBeNull()
    expect(crpHeader).toHaveClass('ring-teal-500')
    await waitFor(() => {
      expect(scrollTo).toHaveBeenCalledWith({ left: 0, behavior: 'smooth' })
    })

    rerender(
      <CumulativeLabReport
        observations={[crp]}
        activeCategoryId="chem"
        focusAnalyteKey="CRP"
        focusNonce={8}
      />,
    )
    await waitFor(() => expect(scrollTo).toHaveBeenCalledTimes(2))
  })
})
