import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { CumulativeLabReport } from '@/features/clinical-summary/reports/components/CumulativeLabReport'
import { LanguageProvider } from '@/src/application/providers/language.provider'
import { AudienceProvider } from '@/src/application/providers/audience.provider'
import { useTabsCumulativeLayout } from './helpers/cumulative-layout'

// A years-of-data chemistry panel is hundreds of date rows × dozens of analyte
// columns, and visited categories stay mounted — so the row count has to be
// bounded by the viewport, not by the patient's history length.
function crpObservations(dayCount: number) {
  return Array.from({ length: dayCount }, (_, index) => {
    const day = new Date(Date.UTC(2024, 0, 1 + index)).toISOString().slice(0, 10)
    return {
      id: `crp-${index}`,
      status: 'final',
      code: { coding: [{ system: 'http://loinc.org', code: '1988-5', display: 'CRP' }] },
      effectiveDateTime: day,
      valueQuantity: { value: 0.5 + index / 100, unit: 'mg/dL' },
    }
  })
}

function Providers({ children }: { children: ReactNode }) {
  return (
    <LanguageProvider>
      <AudienceProvider>{children}</AudienceProvider>
    </LanguageProvider>
  )
}

const dateRows = (container: HTMLElement) =>
  container.querySelectorAll('tbody tr[data-index]')

// TanStack Virtual sizes its window from offsetHeight, which jsdom always
// reports as 0 — every row would fall outside a zero-height viewport. Give the
// scroll region a realistic 60vh and each row its estimated height so the
// windowing maths under test is the same one the browser runs.
const VIEWPORT_HEIGHT = 600
const ROW_HEIGHT = 28

describe('CumulativeLabReport date-row virtualization', () => {
  // Virtualization is a 分頁-layout contract: 直式 bounds the row count with
  // the 顯示範圍 selector instead, and never virtualizes.
  useTabsCumulativeLayout()

  const originalOffsetHeight = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'offsetHeight',
  )

  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get(this: HTMLElement) {
        if (this.getAttribute('role') === 'region') return VIEWPORT_HEIGHT
        if (this.tagName === 'TR') return ROW_HEIGHT
        return 0
      },
    })
  })

  afterAll(() => {
    if (originalOffsetHeight) {
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeight)
    }
  })

  it('renders only a window of rows for a large pivot', () => {
    const { container } = render(
      <Providers>
        <CumulativeLabReport observations={crpObservations(200)} activeCategoryId="chem" />
      </Providers>,
    )

    const rendered = dateRows(container)
    expect(rendered.length).toBeGreaterThan(0)
    expect(rendered.length).toBeLessThan(80)
    // Spacer rows carry the un-rendered height so the scrollbar and the sticky
    // header still describe the full 200-row table.
    expect(container.querySelectorAll('tbody tr[aria-hidden="true"]').length)
      .toBeGreaterThan(0)
  })

  it('renders every row below the virtualization threshold', () => {
    const { container } = render(
      <Providers>
        <CumulativeLabReport observations={crpObservations(12)} activeCategoryId="chem" />
      </Providers>,
    )

    expect(dateRows(container)).toHaveLength(12)
    expect(container.querySelectorAll('tbody tr[aria-hidden="true"]')).toHaveLength(0)
  })
})
