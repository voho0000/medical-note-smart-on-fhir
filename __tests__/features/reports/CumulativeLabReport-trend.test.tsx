import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { CumulativeLabReport } from '@/features/clinical-summary/reports/components/CumulativeLabReport'
import { LanguageProvider } from '@/src/application/providers/language.provider'
import { AudienceProvider } from '@/src/application/providers/audience.provider'
import {
  RightDetailProvider,
  useRightDetail,
} from '@/src/application/providers/right-detail.provider'
import { buildLabTrendSeries } from '@/src/shared/utils/lab-trend.utils'

jest.mock('@/src/shared/utils/lab-trend.utils', () => {
  const actual = jest.requireActual('@/src/shared/utils/lab-trend.utils')
  return {
    ...actual,
    buildLabTrendSeries: jest.fn(actual.buildLabTrendSeries),
  }
})

const mockBuildLabTrendSeries = jest.mocked(buildLabTrendSeries)

const observations = [
  {
    id: 'crp-1',
    status: 'final',
    code: { coding: [{ system: 'http://loinc.org', code: '1988-5', display: 'CRP' }] },
    effectiveDateTime: '2026-01-01',
    valueQuantity: { value: 0.5, unit: 'mg/dL' },
  },
  {
    id: 'crp-2',
    status: 'final',
    code: { coding: [{ system: 'http://loinc.org', code: '1988-5', display: 'CRP' }] },
    effectiveDateTime: '2026-07-01',
    valueQuantity: { value: 0.8, unit: 'mg/dL' },
  },
]

function RightDetailHost() {
  const { detail } = useRightDetail()
  return detail ? <aside data-testid="right-detail-host">{detail.node}</aside> : null
}

function Providers({ children, detailHost = false }: { children: ReactNode; detailHost?: boolean }) {
  return (
    <LanguageProvider>
      <AudienceProvider>
        <RightDetailProvider>
          {children}
          {detailHost && <RightDetailHost />}
        </RightDetailProvider>
      </AudienceProvider>
    </LanguageProvider>
  )
}

describe('CumulativeLabReport trend entry', () => {
  const originalMatchMedia = window.matchMedia

  beforeEach(() => {
    mockBuildLabTrendSeries.mockClear()
  })

  afterEach(() => {
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: originalMatchMedia })
    jest.restoreAllMocks()
  })

  it('opens a shared right-pane trend on desktop and keeps the selected column highlighted', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: jest.fn().mockReturnValue({ matches: true }),
    })

    const { container } = render(
      <Providers detailHost>
        <CumulativeLabReport observations={observations} activeCategoryId="chem" />
      </Providers>,
    )

    // Building the table and changing categories must not construct one full
    // trend series per analyte. Only the analyte the user opens is expanded.
    expect(mockBuildLabTrendSeries).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /查看 CRP 趨勢/ }))

    expect(mockBuildLabTrendSeries).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('right-detail-host')).toBeInTheDocument()
    expect(screen.getByTestId('cumulative-trend-detail')).toHaveTextContent('最新結果')
    expect(container.querySelector('[data-lab-test-key="CRP"]')).toHaveAttribute('data-trend-active', 'true')
  })

  it('uses a dialog below the split-view breakpoint', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: jest.fn().mockReturnValue({ matches: false }),
    })

    render(
      <Providers>
        <CumulativeLabReport observations={observations} activeCategoryId="chem" />
      </Providers>,
    )

    fireEvent.click(screen.getByRole('button', { name: /查看 CRP 趨勢/ }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /CRP.*檢驗趨勢/ })).toBeInTheDocument()
  })

  it('does not expose a trend action for a single result', () => {
    render(
      <Providers>
        <CumulativeLabReport observations={observations.slice(0, 1)} activeCategoryId="chem" />
      </Providers>,
    )

    expect(screen.queryByRole('button', { name: /查看 CRP 趨勢/ })).not.toBeInTheDocument()
  })
})
