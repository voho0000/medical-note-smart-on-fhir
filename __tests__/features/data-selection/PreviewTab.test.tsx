import { fireEvent, render, screen } from '@testing-library/react'
import { PreviewTab } from '@/features/data-selection/components/PreviewTab'

const copy = jest.fn(async () => true)

jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({
    t: {
      common: { copy: 'Copy', copied: 'Copied', copyFailed: 'Copy failed' },
      dataSelection: {
        formattedClinicalContext: 'AI preview',
        formattedClinicalContextDescription: 'Description',
        maskIdentifiers: 'Mask identifiers',
        maskIdentifiersOn: 'Masked',
        maskIdentifiersOff: 'Raw PHI warning',
        noDataSelected: 'No data',
      },
    },
  }),
}))

jest.mock('@/src/shared/hooks/use-copy-to-clipboard', () => ({
  useCopyToClipboard: () => ({ copied: false, copy }),
}))

describe('PreviewTab privacy default', () => {
  beforeEach(() => copy.mockClear())

  it('previews and copies the masked context by default', () => {
    render(<PreviewTab formattedClinicalContext="Name: Wang" maskedClinicalContext="Name: [REDACTED]" />)

    expect(screen.getByTestId('clinical-context-preview')).toHaveTextContent('Name: [REDACTED]')
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    expect(copy).toHaveBeenCalledWith('Name: [REDACTED]')
  })

  it('requires an explicit switch action before raw PHI is previewed and copied', () => {
    render(<PreviewTab formattedClinicalContext="Name: Wang" maskedClinicalContext="Name: [REDACTED]" />)

    fireEvent.click(screen.getByRole('switch', { name: 'Mask identifiers' }))
    expect(screen.getByText('Raw PHI warning')).toBeInTheDocument()
    expect(screen.getByTestId('clinical-context-preview')).toHaveTextContent('Name: Wang')
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    expect(copy).toHaveBeenCalledWith('Name: Wang')
  })
})
