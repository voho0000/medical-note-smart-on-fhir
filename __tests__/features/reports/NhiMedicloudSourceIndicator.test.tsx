import { fireEvent, render, screen } from '@testing-library/react'
import { LanguageProvider } from '@/src/application/providers/language.provider'
import { NhiMedicloudSourceIndicator } from '@/features/clinical-summary/reports/components/NhiMedicloudSourceIndicator'

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('NhiMedicloudSourceIndicator', () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      value: ResizeObserverMock,
    })
  })

  it('uses the short visible label and exposes the full source disclosure by pointer', async () => {
    render(
      <LanguageProvider>
        <NhiMedicloudSourceIndicator />
      </LanguageProvider>,
    )

    const indicator = screen.getByTestId('nhi-medicloud-source')
    expect(indicator).toHaveTextContent('健保雲端圖形化查詢｜院所未提供')
    expect(screen.queryByText('健保醫療資訊雲端查詢系統')).not.toBeInTheDocument()

    fireEvent.pointerMove(indicator)

    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent('資料來源：健保醫療資訊雲端查詢系統')
    expect(tooltip).toHaveTextContent('原檢驗院所：未提供')
    expect(tooltip).toHaveTextContent('僅供診療參考，並非原始檢驗報告')
  })

  it('shows a supplied original testing institution without claiming it is missing', async () => {
    render(
      <LanguageProvider>
        <NhiMedicloudSourceIndicator institution="臺北榮民總醫院；門診檢驗科；0601160016" />
      </LanguageProvider>,
    )

    const indicator = screen.getByTestId('nhi-medicloud-source')
    expect(indicator).toHaveTextContent('健保雲端圖形化查詢｜臺北榮民總醫院')
    fireEvent.pointerMove(indicator)
    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent('原檢驗院所：臺北榮民總醫院')
    expect(tooltip).not.toHaveTextContent('來源未包含實際檢驗院所')
  })
})
