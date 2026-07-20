import { act, render, screen, waitFor } from '@testing-library/react'
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

  it('shows all categories when they fit and restores More when space shrinks', async () => {
    render(<CumulativeLabReport observations={[]} />, { wrapper: TestProviders })

    await waitFor(() => expect(screen.getByRole('button', { name: '查看更多' })).toBeInTheDocument())
    expect(screen.queryByRole('tab', { name: '血氣 (0)' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: '病毒抗原 (0)' })).not.toBeInTheDocument()

    availableWidth = 1000
    act(() => window.dispatchEvent(new Event('resize')))

    await waitFor(() => expect(screen.queryByRole('button', { name: '查看更多' })).not.toBeInTheDocument())
    expect(screen.getByRole('tab', { name: '血氣 (0)' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '病毒抗原 (0)' })).toBeInTheDocument()

    availableWidth = 560
    act(() => window.dispatchEvent(new Event('resize')))

    await waitFor(() => expect(screen.getByRole('button', { name: '查看更多' })).toBeInTheDocument())
    expect(screen.queryByRole('tab', { name: '血氣 (0)' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: '病毒抗原 (0)' })).not.toBeInTheDocument()
  })
})
