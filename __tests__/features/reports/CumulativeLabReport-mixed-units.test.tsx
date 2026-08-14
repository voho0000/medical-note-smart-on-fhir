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
  const inferredUnitTag = {
    system: 'https://nhi-fhir-bridge.github.io/CodeSystem/sdk-unit-origin',
    code: 'bridge-inferred',
  }

  it('shows a normalised unit once in the column header, not below each value', () => {
    const { container } = render(
      <CumulativeLabReport
        activeCategoryId="chem"
        observations={[
          {
            id: 'ast-iu-l',
            code: { text: 'AST', coding: [{ system: 'http://loinc.org', code: '1920-8' }] },
            valueQuantity: {
              value: 21,
              unit: 'IU/L',
              code: '[iU]/L',
              system: 'http://unitsofmeasure.org',
            },
            effectiveDateTime: '2026-01-02',
          },
          {
            id: 'ast-u-l',
            code: { text: 'AST', coding: [{ system: 'http://loinc.org', code: '1920-8' }] },
            valueQuantity: {
              value: 19,
              unit: 'U/L',
              code: 'U/L',
              system: 'http://unitsofmeasure.org',
            },
            effectiveDateTime: '2026-01-01',
          },
        ]}
      />,
      { wrapper: TestProviders },
    )

    const astHeader = container.querySelector<HTMLElement>('[data-lab-test-key="AST"]')
    expect(astHeader).not.toBeNull()
    expect(astHeader).toHaveTextContent('U/L')
    expect(
      [...container.querySelectorAll('tbody td div')]
        .filter((element) => element.textContent === 'U/L'),
    ).toHaveLength(0)
  })

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

  it('moves an entirely inferred SDK unit to the column header', () => {
    const { container } = render(
      <CumulativeLabReport
        observations={[
          {
            id: 'wbc-1',
            meta: { tag: [inferredUnitTag] },
            code: { text: 'WBC', coding: [{ system: 'http://loinc.org', code: '6690-2' }] },
            valueQuantity: { value: 7.17, unit: 'K/µL', code: '10*3/uL', system: 'http://unitsofmeasure.org' },
            effectiveDateTime: '2026-07-20',
          },
          {
            id: 'wbc-2',
            meta: { tag: [inferredUnitTag] },
            code: { text: 'WBC', coding: [{ system: 'http://loinc.org', code: '6690-2' }] },
            valueQuantity: { value: 4.4, unit: 'K/µL', code: '10*3/uL', system: 'http://unitsofmeasure.org' },
            effectiveDateTime: '2026-06-17',
          },
        ]}
      />,
      { wrapper: TestProviders },
    )

    const wbcHeader = container.querySelector<HTMLElement>('[data-lab-test-key="WBC"]')
    expect(wbcHeader).not.toBeNull()
    expect(wbcHeader).toHaveTextContent('K/µL')
    expect(wbcHeader).toHaveTextContent('推估單位')
    expect(
      [...container.querySelectorAll('tbody td div')]
        .filter((element) => element.textContent === '推估單位'),
    ).toHaveLength(0)
  })

  it('keeps per-result provenance when a column mixes source and inferred units', () => {
    const { container } = render(
      <CumulativeLabReport
        observations={[
          {
            id: 'wbc-inferred',
            meta: { tag: [inferredUnitTag] },
            code: { text: 'WBC', coding: [{ system: 'http://loinc.org', code: '6690-2' }] },
            valueQuantity: { value: 7.17, unit: 'K/µL', code: '10*3/uL', system: 'http://unitsofmeasure.org' },
            effectiveDateTime: '2026-07-20',
          },
          {
            id: 'wbc-source',
            code: { text: 'WBC', coding: [{ system: 'http://loinc.org', code: '6690-2' }] },
            valueQuantity: { value: 4.4, unit: 'K/µL', code: '10*3/uL', system: 'http://unitsofmeasure.org' },
            effectiveDateTime: '2026-06-17',
          },
        ]}
      />,
      { wrapper: TestProviders },
    )

    const wbcHeader = container.querySelector<HTMLElement>('[data-lab-test-key="WBC"]')
    expect(wbcHeader).not.toHaveTextContent('推估單位')
    expect(
      [...container.querySelectorAll('tbody td div')]
        .filter((element) => element.textContent === '推估單位'),
    ).toHaveLength(1)
  })

  it('uses the theme-aware clinical color for abnormal values', () => {
    render(
      <CumulativeLabReport
        observations={[
          {
            id: 'hb-high',
            code: { text: 'Hemoglobin', coding: [{ system: 'http://loinc.org', code: '718-7' }] },
            valueQuantity: { value: 18.2, unit: 'g/dL', code: 'g/dL', system: 'http://unitsofmeasure.org' },
            interpretation: [{ coding: [{ code: 'H', display: 'High' }] }],
            effectiveDateTime: '2026-08-12',
          },
        ]}
      />,
      { wrapper: TestProviders },
    )

    const abnormalCell = screen.getByText('18.2').closest('td')
    expect(abnormalCell).toHaveClass('text-clinical-abnormal')
    expect(abnormalCell).not.toHaveClass('text-red-600')
  })
})
