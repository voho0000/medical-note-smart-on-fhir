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

  it('keeps the compact control in the single-row toolbar', () => {
    const { container } = render(<ChatToolbar {...baseProps} />)

    const toolbar = container.querySelector('[data-tour="chat-template-tools"]')
    expect(toolbar).toHaveClass('flex')
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
})
