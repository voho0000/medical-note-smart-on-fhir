import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AiHandoffPanel } from '@/features/ips-export/components/AiHandoffPanel'

jest.mock('@/src/application/hooks/patient/use-patient-query.hook', () => ({
  usePatient: () => ({ patient: { id: 'patient-1' } }),
}))

jest.mock('@/src/application/hooks/use-clinical-context.hook', () => ({
  useClinicalContext: () => ({
    getFormattedClinicalContext: () => 'SENSITIVE CLINICAL CONTEXT',
    getFullClinicalContext: () => 'MASKED CLINICAL CONTEXT',
  }),
}))

jest.mock('@/src/shared/hooks/use-copy-to-clipboard', () => ({
  useCopyToClipboard: () => ({ copied: false, copy: jest.fn().mockResolvedValue(true) }),
}))

jest.mock('@/features/data-selection', () => ({
  DataSelectionDrawer: () => null,
}))

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}))

const aiHandoff = {
  chooseData: 'Choose data',
  questionPlaceholder: 'Question',
  optionalQuestionAction: 'Attach a question (optional)',
  optionalQuestionLabel: 'Question to copy with the data (optional)',
  optionalQuestionHint: 'Leave this blank to copy only the health data.',
  optionalQuestionRemove: 'Remove question',
  advancedOptions: 'Advanced',
  outputFormat: 'Output format',
  quickProfile: 'Quick copy',
  traceableProfile: 'Traceable package',
  quickDescription: 'Quick',
  traceableDescription: 'Traceable',
  maskIdentifiers: 'Mask identifiers',
  maskingLimitNotice: 'Masking is not anonymization',
  unmaskedWarning: 'Unmasked',
  unmaskConfirmTitle: 'Show unmasked health data?',
  unmaskConfirmDescription: 'Unmask description',
  unmaskConfirmAction: 'Show unmasked data',
  externalConfirmTitle: 'Confirm sharing unmasked data',
  externalConfirmDescription: 'Share with {destination}',
  externalConfirmAction: 'Copy and open',
  exactPreviewHint: 'Exact preview',
  destinationsTitle: 'Destinations',
  destinationsDescription: 'Copy and open',
  pasteHint: 'Paste it',
  popupBlocked: 'Blocked',
  copiedAndOpened: 'Opened {destination}',
  scopeTitle: 'Scope',
  scopeDescription: 'Scope description',
  scopeApplyHint: 'Apply',
}

jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({
    locale: 'en',
    t: {
      common: { copy: 'Copy', copied: 'Copied', copyFailed: 'Copy failed', cancel: 'Cancel' },
      ipsExport: { aiHandoff },
    },
  }),
}))

describe('AiHandoffPanel', () => {
  const writeText = jest.fn().mockResolvedValue(undefined)
  const replace = jest.fn()

  beforeEach(() => {
    writeText.mockClear()
    replace.mockClear()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    jest.spyOn(window, 'open').mockReturnValue({
      opener: null,
      location: { replace },
      close: jest.fn(),
    } as unknown as Window)
  })

  afterEach(() => jest.restoreAllMocks())

  it('copies the selected data without requiring a question for general AI destinations', async () => {
    render(<AiHandoffPanel />)
    fireEvent.click(screen.getByRole('button', { name: /ChatGPT/ }))

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(writeText.mock.calls[0][0]).toContain('MASKED CLINICAL CONTEXT')
    expect(writeText.mock.calls[0][0]).not.toContain('# My question')
    expect(replace).toHaveBeenCalledWith('https://chatgpt.com/')
  })

  it('can optionally attach a free-text question to the general AI artifact', async () => {
    render(<AiHandoffPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Attach a question (optional)' }))
    fireEvent.change(screen.getByLabelText('Question to copy with the data (optional)'), {
      target: { value: 'Review my data' },
    })
    fireEvent.click(screen.getByRole('button', { name: /ChatGPT/ }))

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(writeText.mock.calls[0][0]).toContain('MASKED CLINICAL CONTEXT')
    expect(writeText.mock.calls[0][0]).toContain('Review my data')
  })

  it('keeps the traceable package in advanced options', async () => {
    render(<AiHandoffPanel />)
    expect(screen.getByTestId('ai-export-exact-preview')).not.toHaveTextContent('export_id:')

    fireEvent.click(screen.getByRole('button', { name: 'Advanced: Quick copy' }))
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Traceable package' }), {
      button: 0,
      ctrlKey: false,
    })

    await waitFor(() => {
      expect(screen.getByTestId('ai-export-exact-preview')).toHaveTextContent('export_id:')
      expect(screen.getByTestId('ai-export-exact-preview')).toHaveTextContent('locale: "en"')
    })
  })

  it('requires confirmation before displaying and opening unmasked data', async () => {
    render(<AiHandoffPanel />)
    expect(screen.getByText('Masking is not anonymization')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('switch', { name: 'Mask identifiers' }))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByTestId('ai-export-exact-preview')).toHaveTextContent('MASKED CLINICAL CONTEXT')

    fireEvent.click(screen.getByRole('button', { name: 'Show unmasked data' }))
    await waitFor(() => {
      expect(screen.getByTestId('ai-export-exact-preview')).toHaveTextContent('SENSITIVE CLINICAL CONTEXT')
    })

    fireEvent.click(screen.getByRole('button', { name: /ChatGPT/ }))
    expect(writeText).not.toHaveBeenCalled()
    expect(screen.getByText('Share with ChatGPT')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Copy and open' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    const payload = writeText.mock.calls[0][0] as string
    expect(payload).toContain('SENSITIVE CLINICAL CONTEXT')
    expect(payload).not.toContain('MASKED CLINICAL CONTEXT')
    expect(replace).toHaveBeenCalledWith('https://chatgpt.com/')
  })
})
