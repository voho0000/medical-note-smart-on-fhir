import { fireEvent, render, screen } from '@testing-library/react'
import { ChatToolbar } from '@/features/medical-chat/components/ChatToolbar'

jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({
    t: {
      chat: {
        insertTemplate: 'Template',
        selectTemplate: 'Choose template',
        templateGallery: 'Gallery',
        manageTemplates: 'Templates',
        patientDataOff: 'Do not use patient data',
        patientDataOffBadge: 'No chart',
        patientDataOffEnable: 'Keep patient data out of this conversation',
        patientDataOffDisable: 'Restore the default data scope',
        exportAiExecution: 'Execution record',
        exportAiExecutionUnavailable: 'No execution record',
      },
      promptGallery: { browseGallery: 'Browse gallery' },
      modelPicker: { chatTooltip: 'Choose model' },
    },
  }),
}))

jest.mock('@/src/application/stores/model-prefs.store', () => ({
  useModelPref: () => 'test-model',
  MODEL_PREF_DEFAULTS: { chat: 'test-model' },
}))

jest.mock('@/src/shared/components/ModelPicker', () => ({ ModelPicker: () => null }))

const baseProps = {
  onInsertTemplate: jest.fn(),
  templates: [],
  onTemplateChange: jest.fn(),
  hasTemplateContent: false,
  onManageTemplates: jest.fn(),
  onModelSelect: jest.fn(),
  patientDataDisabled: false,
  canTogglePatientData: true,
  onTogglePatientData: jest.fn(),
  onOpenAiExecution: jest.fn(),
  canExportAiExecution: false,
}

describe('ChatToolbar patient-data badge', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('uses a two-row mobile grid and returns to one row on wider screens', () => {
    const { container } = render(<ChatToolbar {...baseProps} />)

    const toolbar = container.querySelector('[data-tour="chat-template-tools"]')
    expect(toolbar).toHaveClass('grid', 'grid-cols-[minmax(0,1fr)_auto_auto]', 'md:flex')
    expect(toolbar).not.toHaveClass('flex-wrap')

    const toggle = screen.getByTestId('chat-patient-data-toggle')
    expect(toggle).toHaveTextContent('No chart')
    expect(toggle).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(toggle)
    expect(baseProps.onTogglePatientData).toHaveBeenCalledTimes(1)
  })

  it('shows the active privacy state and hides the badge without a patient', () => {
    const { rerender } = render(
      <ChatToolbar {...baseProps} patientDataDisabled />,
    )

    expect(screen.getByTestId('chat-patient-data-toggle')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('chat-patient-data-toggle')).toHaveClass('bg-sky-50')

    rerender(<ChatToolbar {...baseProps} canTogglePatientData={false} />)
    expect(screen.queryByTestId('chat-patient-data-toggle')).not.toBeInTheDocument()
  })

  it('keeps the selected template name visible in the mobile toolbar', () => {
    render(
      <ChatToolbar
        {...baseProps}
        templates={[{
          id: 'clinical-summary',
          label: 'Clinical summary template',
          content: 'Summarize this chart',
        }]}
        selectedTemplateId="clinical-summary"
        hasTemplateContent
      />,
    )

    const label = screen.getByText('Clinical summary template')
    expect(label).toHaveClass('truncate')
    expect(label).not.toHaveClass('hidden')
    expect(screen.getByTestId('chat-template-insert')).toHaveAccessibleName(
      'Template：Clinical summary template',
    )
    expect(screen.getByTestId('chat-patient-data-toggle')).toHaveClass(
      'max-md:col-span-2',
      '[html[data-keyboard-open=true]_&]:hidden',
    )
    expect(screen.getByTestId('chat-ai-execution-export')).toHaveClass(
      '[html[data-keyboard-open=true]_&]:hidden',
    )
  })
})
