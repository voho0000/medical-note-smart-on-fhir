import type { MouseEventHandler, ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { ModelPicker } from '@/src/shared/components/ModelPicker'
import { LanguageProvider } from '@/src/application/providers/language.provider'
import {
  RightPanelProvider,
  useRightPanel,
} from '@/src/application/providers/right-panel.provider'
import { useAiConfigStore } from '@/src/application/stores/ai-config.store'
import { customOpenAiModelIdForProfile } from '@/src/shared/constants/ai-models.constants'

jest.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => (
    <div role="menu">{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    disabled,
    onClick,
    title,
    'data-testid': testId,
    'aria-label': ariaLabel,
  }: {
    children: ReactNode
    disabled?: boolean
    onClick?: MouseEventHandler<HTMLButtonElement>
    title?: string
    'data-testid'?: string
    'aria-label'?: string
  }) => (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      title={title}
      data-testid={testId}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  ),
  DropdownMenuLabel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
}))

function NavigationProbe() {
  const { activeTab, settingsTab, settingsTarget } = useRightPanel()
  return (
    <output data-testid="settings-navigation">
      {`${activeTab}|${settingsTab}|${settingsTarget ?? 'none'}`}
    </output>
  )
}

describe('ModelPicker custom model management entry', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    useAiConfigStore.setState({
      apiKey: null,
      geminiKey: null,
      claudeKey: null,
      credentialsHydrating: false,
      openAiCompatibleProfiles: [{
        profileId: 'hospital-7b',
        enabled: true,
        baseUrl: 'https://models.example.org/v1/chat/completions',
        modelId: 'hospital/qwen-7b',
        apiKey: 'test-key',
        transport: 'direct',
        contextWindowTokens: 32768,
        contextWindowSource: 'manual',
      }],
    })
  })

  it('keeps a separate add entry after a custom endpoint is configured', () => {
    const onSelect = jest.fn()

    render(
      <LanguageProvider>
        <RightPanelProvider>
          <ModelPicker
            modelId={customOpenAiModelIdForProfile('hospital-7b')}
            fallbackModelId="gemini-3.1-flash-lite"
            onSelect={onSelect}
          />
          <NavigationProbe />
        </RightPanelProvider>
      </LanguageProvider>,
    )

    expect(screen.getAllByText('hospital/qwen-7b').length).toBeGreaterThan(0)
    const addEntry = screen.getByTestId('model-picker-add-custom-model')
    expect(addEntry).toHaveAccessibleName('新增自訂模型')

    fireEvent.click(addEntry)

    expect(onSelect).not.toHaveBeenCalled()
    expect(screen.getByTestId('settings-navigation')).toHaveTextContent(
      'settings|ai|openai-compatible-add-profile',
    )
  })
})
