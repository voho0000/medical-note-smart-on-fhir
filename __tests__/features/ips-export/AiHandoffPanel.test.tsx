import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AiHandoffPanel } from '@/features/ips-export/components/AiHandoffPanel'

let audience: 'medical' | 'patient' = 'medical'

jest.mock('@/src/application/providers/audience.provider', () => ({
  useAudience: () => ({ audience }),
}))

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
  title: 'Ask AI',
  description: 'Free text',
  chooseData: 'Choose data',
  questionPlaceholder: 'Question',
  optionalQuestionAction: 'Attach a question (optional)',
  optionalQuestionLabel: 'Question to copy with the data (optional)',
  optionalQuestionHint: 'Leave this blank to copy only the health data.',
  optionalQuestionRemove: 'Remove question',
  quickProfile: 'Quick copy',
  traceableProfile: 'Traceable package',
  quickDescription: 'Quick',
  traceableDescription: 'Traceable',
  maskIdentifiers: 'Mask identifiers',
  unmaskedWarning: 'Unmasked',
  exactPreviewHint: 'Exact preview',
  destinationsTitle: 'Destinations',
  destinationsDescription: 'Copy and open',
  pasteHint: 'Paste it',
  popupBlocked: 'Blocked',
  copiedAndOpened: 'Opened {destination}',
  openEvidenceQuestionOnly: 'Question only',
  openEvidencePreflight: 'Check sign-in first',
  openEvidenceClinicianOnly: 'Clinicians only',
  openEvidenceQuestionLabel: 'Question for OpenEvidence',
  openEvidenceQuestionPlaceholder: 'Enter a clinical question',
  openEvidenceAttestation: 'I am registered and signed in',
  openEvidenceAction: 'Copy question and open OpenEvidence',
  scopeTitle: 'Scope',
  scopeDescription: 'Scope description',
  scopeApplyHint: 'Apply',
}

jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({
    t: {
      common: { copy: 'Copy', copied: 'Copied', copyFailed: 'Copy failed' },
      ipsExport: { aiHandoff },
    },
  }),
}))

describe('AiHandoffPanel', () => {
  const writeText = jest.fn().mockResolvedValue(undefined)
  const replace = jest.fn()

  beforeEach(() => {
    audience = 'medical'
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
    expect(writeText.mock.calls[0][0]).not.toContain('# 我的問題')
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

  it('gates OpenEvidence and copies a question-only artifact', async () => {
    render(<AiHandoffPanel />)
    fireEvent.change(screen.getByLabelText('Question for OpenEvidence'), {
      target: { value: 'Could aspirin explain bruising?' },
    })

    const action = screen.getByRole('button', { name: /Copy question and open OpenEvidence/ })
    expect(action).toBeDisabled()
    fireEvent.click(screen.getByLabelText('I am registered and signed in'))
    expect(action).toBeEnabled()
    fireEvent.click(action)

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    const payload = writeText.mock.calls[0][0] as string
    expect(payload).toContain('Could aspirin explain bruising?')
    expect(payload).not.toContain('MASKED CLINICAL CONTEXT')
    expect(payload).not.toContain('SENSITIVE CLINICAL CONTEXT')
    expect(replace).toHaveBeenCalledWith('https://www.openevidence.com/')
  })

  it('does not offer the OpenEvidence attestation outside medical mode', () => {
    audience = 'patient'
    render(<AiHandoffPanel />)
    expect(screen.getByText('Clinicians only')).toBeInTheDocument()
    expect(screen.queryByLabelText('I am registered and signed in')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Copy question and open OpenEvidence/ })).toBeDisabled()
  })
})
