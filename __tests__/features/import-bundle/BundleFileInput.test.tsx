import { act, render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'

import { BundleFileInput } from '@/features/import-bundle/components/BundleFileInput'

describe('BundleFileInput', () => {
  it('does not expose the extension handoff target in server HTML', () => {
    const html = renderToString(
      <BundleFileInput testId="import-bundle-input" importFile={jest.fn()} />,
    )

    expect(html).not.toContain('import-bundle-input')
  })

  it('publishes the handoff target only after the client stability window', () => {
    jest.useFakeTimers()
    render(<BundleFileInput testId="import-bundle-input" importFile={jest.fn()} />)

    expect(screen.queryByTestId('import-bundle-input')).not.toBeInTheDocument()
    act(() => jest.advanceTimersByTime(999))
    expect(screen.queryByTestId('import-bundle-input')).not.toBeInTheDocument()
    act(() => jest.advanceTimersByTime(1))
    expect(screen.getByTestId('import-bundle-input')).toBeInTheDocument()
    jest.useRealTimers()
  })
})
