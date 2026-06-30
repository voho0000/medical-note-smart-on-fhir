/**
 * @jest-environment jsdom
 */
// The follow-up suggestion chips: a label is shown on the pill, but clicking it
// must send the FULL prompt (not the short label). Empty list renders nothing so
// it never leaves a blank gap in the thread.
import { render, screen, fireEvent } from '@testing-library/react'
import { SuggestionChips } from '@/features/medical-chat/components/SuggestionChips'

const suggestions = [
  { label: 'Go deeper', prompt: 'Explain the abnormal labs in more detail' },
  { label: 'Patient education', prompt: 'Write a patient-friendly summary of the plan' },
]

describe('SuggestionChips', () => {
  it('renders one pill per suggestion, label visible and full prompt as the title', () => {
    render(<SuggestionChips suggestions={suggestions} onPick={() => {}} />)
    expect(screen.getByText('Go deeper')).toBeInTheDocument()
    expect(screen.getByText('Patient education')).toBeInTheDocument()
    expect(screen.getByText('Go deeper').closest('button')).toHaveAttribute(
      'title',
      'Explain the abnormal labs in more detail',
    )
  })

  it('clicking a chip sends its FULL prompt, not the label', () => {
    const onPick = jest.fn()
    render(<SuggestionChips suggestions={suggestions} onPick={onPick} />)
    fireEvent.click(screen.getByText('Patient education'))
    expect(onPick).toHaveBeenCalledWith('Write a patient-friendly summary of the plan')
  })

  it('renders nothing when there are no suggestions', () => {
    const { container } = render(<SuggestionChips suggestions={[]} onPick={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('disables every chip while disabled (e.g. a reply is streaming)', () => {
    render(<SuggestionChips suggestions={suggestions} onPick={() => {}} disabled />)
    expect(screen.getByText('Go deeper').closest('button')).toBeDisabled()
    expect(screen.getByText('Patient education').closest('button')).toBeDisabled()
  })
})
