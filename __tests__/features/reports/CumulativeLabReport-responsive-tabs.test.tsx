import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

describe('CumulativeLabReport responsive category tabs', () => {
  const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
  const originalScrollWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollWidth')
  let availableWidth = 560
  const allTabsWidth = 860

  beforeEach(() => {
    availableWidth = 560
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get() {
        return this.getAttribute('data-slot') === 'tabs-list' ? availableWidth : 0
      },
    })
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
      configurable: true,
      get() {
        return this.hasAttribute('data-cumulative-tabs-measure') ? allTabsWidth : 0
      },
    })
  })

  afterAll(() => {
    if (originalClientWidth) {
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidth)
    }
    if (originalScrollWidth) {
      Object.defineProperty(HTMLElement.prototype, 'scrollWidth', originalScrollWidth)
    }
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('keeps the trend hint in the zoomed-desktop utility row', () => {
    const { container } = render(<CumulativeLabReport observations={[]} />, { wrapper: TestProviders })

    const shortHint = screen.getByText('查看趨勢')
    const fullHint = screen.getByText('點檢驗名稱查看趨勢')
    expect(shortHint).toHaveClass('@min-[480px]:hidden')
    expect(fullHint).toHaveClass('hidden', '@min-[480px]:block')
    expect(shortHint.parentElement).toHaveClass('@min-[390px]:inline-flex', 'overflow-hidden')
    const analyteSearch = screen.getByRole('combobox', { name: '搜尋檢驗項目' })
    expect(analyteSearch).toHaveClass('min-h-[36px]', 'md:min-h-0')
    expect(analyteSearch.parentElement).toHaveClass(
      '@min-[390px]:max-w-[160px]',
      '@min-[480px]:max-w-[220px]',
      '@min-[640px]:max-w-[260px]',
    )
    expect(shortHint.parentElement?.parentElement).toHaveClass(
      'grid-cols-[minmax(0,1fr)_auto]',
      '@min-[390px]:grid-cols-[minmax(140px,160px)_minmax(0,1fr)_auto]',
      '@min-[480px]:grid-cols-[minmax(200px,220px)_minmax(0,1fr)_auto]',
      '@min-[640px]:grid-cols-[minmax(220px,260px)_minmax(0,1fr)_auto]',
    )
    expect(container.querySelector('.col-start-2')).toHaveClass(
      'col-start-2',
      '@min-[390px]:col-start-3',
    )
    expect(screen.getByRole('tablist', { name: '累積報告分類' })).toHaveClass(
      'max-md:!min-h-[36px]',
      'max-md:[scrollbar-width:none]',
    )
    expect(screen.getByRole('tab', { name: '血液 (0)' })).toHaveClass('max-md:!min-h-[36px]')
    expect(container.querySelector('.\\@container')).toBeInTheDocument()
  })

  it('uses clinician-facing labels instead of internal canonical keys', () => {
    const observations = [
      {
        id: 'calcium',
        status: 'final',
        code: { coding: [{ system: 'http://loinc.org', code: '17861-6' }] },
        effectiveDateTime: '2026-06-02',
        valueQuantity: { value: 8.5, unit: 'mg/dL' },
      },
      {
        id: 'egfr',
        status: 'final',
        code: {
          text: 'eGFR(M)',
          coding: [{ system: 'http://loinc.org', code: '77147-7' }],
        },
        effectiveDateTime: '2026-06-02',
        valueQuantity: { value: 32, unit: 'mL/min/1.73m2' },
      },
    ]
    const { container } = render(
      <CumulativeLabReport observations={observations} activeCategoryId="chem" />,
      { wrapper: TestProviders },
    )

    expect(container.querySelector('[data-lab-test-key="CA"]')).toHaveTextContent('Ca')
    expect(container.querySelector('[data-lab-test-key="EGFR(M)"]')).toHaveTextContent('eGFR')
    expect(container.querySelector('[data-lab-test-key="EGFR(M)"]')).not.toHaveTextContent('EGFR(M)')
  })

  it('shows all categories when they fit and restores More when space shrinks', async () => {
    render(<CumulativeLabReport observations={[]} />, { wrapper: TestProviders })

    await waitFor(() => expect(screen.getByRole('button', { name: '查看更多' })).toBeInTheDocument())
    expect(screen.queryByRole('tab', { name: '其他 (0)' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: '血氣 (0)' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: '病毒抗原 (0)' })).not.toBeInTheDocument()

    availableWidth = 1000
    act(() => window.dispatchEvent(new Event('resize')))

    await waitFor(() => expect(screen.queryByRole('button', { name: '查看更多' })).not.toBeInTheDocument())
    expect(screen.queryByRole('tab', { name: '其他 (0)' })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '血氣 (0)' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '病毒抗原 (0)' })).toBeInTheDocument()

    availableWidth = 560
    act(() => window.dispatchEvent(new Event('resize')))

    await waitFor(() => expect(screen.getByRole('button', { name: '查看更多' })).toBeInTheDocument())
    expect(screen.queryByRole('tab', { name: '血氣 (0)' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: '病毒抗原 (0)' })).not.toBeInTheDocument()
  })

  it('performance contract: selects a category one paint before mounting its table', () => {
    jest.useFakeTimers()
    const frameCallbacks: FrameRequestCallback[] = []
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frameCallbacks.push(callback)
      return frameCallbacks.length
    })

    render(<CumulativeLabReport observations={[]} />, { wrapper: TestProviders })

    const chemistryTab = screen.getByRole('tab', { name: '生化 (0)' })
    fireEvent.mouseDown(chemistryTab, { button: 0, ctrlKey: false })

    expect(chemistryTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('載入')
    expect(screen.queryByRole('region', { name: /生化累積檢驗表/ })).not.toBeInTheDocument()

    act(() => {
      frameCallbacks.splice(0).forEach((callback) => callback(16))
    })
    expect(screen.getByRole('status')).toHaveTextContent('載入')
    expect(screen.queryByRole('region', { name: /生化累積檢驗表/ })).not.toBeInTheDocument()

    act(() => {
      jest.runOnlyPendingTimers()
    })
    expect(screen.getByRole('region', { name: /生化累積檢驗表/ })).toBeInTheDocument()

    fireEvent.mouseDown(screen.getByRole('tab', { name: '血液 (0)' }), {
      button: 0,
      ctrlKey: false,
    })
    fireEvent.mouseDown(chemistryTab, { button: 0, ctrlKey: false })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: /生化累積檢驗表/ })).toBeInTheDocument()
  })
})
