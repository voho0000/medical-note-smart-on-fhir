import { render, screen } from '@testing-library/react'
import { ErrorBoundary } from '@/src/shared/components/ErrorBoundary'
import { recoverFromChunkLoadError } from '@/src/shared/utils/chunk-load-recovery'

function ThrowError({ error }: { error: Error }): never {
  throw error
}

describe('ErrorBoundary', () => {
  const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)

  beforeEach(() => {
    window.sessionStorage.clear()
    consoleError.mockClear()
  })

  afterAll(() => {
    consoleError.mockRestore()
  })

  it('shows a friendly reload action after the automatic chunk retry was already used', () => {
    const error = new Error(
      'Failed to load chunk /app/_next/static/chunks/example.js from module 123',
    )
    recoverFromChunkLoadError(error, {
      storage: window.sessionStorage,
      reload: jest.fn(),
    })

    render(
      <ErrorBoundary>
        <ThrowError error={error} />
      </ErrorBoundary>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('網站已更新，需要重新載入')
    expect(screen.getByText('頁面使用的舊版程式已失效。重新載入後會保留已儲存的設定與資料。'))
      .toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新載入頁面' })).toBeInTheDocument()
    expect(screen.queryByText(/example\.js/)).not.toBeInTheDocument()
  })

  it('keeps ordinary render errors visible without presenting them as an update', () => {
    render(
      <ErrorBoundary>
        <ThrowError error={new Error('Example render failure')} />
      </ErrorBoundary>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('畫面暫時無法顯示')
    expect(screen.getByText('Example render failure')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '重新載入頁面' })).not.toBeInTheDocument()
  })
})
