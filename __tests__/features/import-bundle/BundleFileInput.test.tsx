import { render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'

import { BundleFileInput } from '@/features/import-bundle/components/BundleFileInput'

describe('BundleFileInput', () => {
  it('does not expose the extension handoff target in server HTML', () => {
    const html = renderToString(
      <BundleFileInput testId="import-bundle-input" importFile={jest.fn()} />,
    )

    expect(html).not.toContain('import-bundle-input')
  })

  it('publishes the handoff target after the client mounts', async () => {
    render(<BundleFileInput testId="import-bundle-input" importFile={jest.fn()} />)

    expect(await screen.findByTestId('import-bundle-input')).toBeInTheDocument()
  })
})
