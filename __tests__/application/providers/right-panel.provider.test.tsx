import { fireEvent, render, screen } from '@testing-library/react'
import {
  RightPanelProvider,
  useRightPanel,
} from '@/src/application/providers/right-panel.provider'

function NavigationHarness() {
  const {
    activeTab,
    settingsTab,
    settingsTarget,
    setActiveTab,
    clearSettingsTarget,
  } = useRightPanel()

  return (
    <div>
      <output data-testid="active-tab">{activeTab}</output>
      <output data-testid="settings-tab">{settingsTab}</output>
      <output data-testid="settings-target">
        {settingsTarget && typeof settingsTarget === 'object'
          ? `${settingsTarget.kind}:${settingsTarget.profileId ?? ''}`
          : settingsTarget ?? 'none'}
      </output>
      <button type="button" onClick={() => setActiveTab('settings', 'display')}>
        Open display
      </button>
      <button
        type="button"
        onClick={() => setActiveTab(
          'settings',
          undefined,
          'openai-compatible-context-window',
        )}
      >
        Open context window
      </button>
      <button
        type="button"
        onClick={() => setActiveTab('settings', 'ai', {
          kind: 'openai-compatible-context-window',
          profileId: 'profile-2',
        })}
      >
        Open profile context window
      </button>
      <button
        type="button"
        onClick={() => setActiveTab(
          'settings',
          'ai',
          'openai-compatible-add-profile',
        )}
      >
        Add custom model
      </button>
      <button type="button" onClick={clearSettingsTarget}>Clear target</button>
    </div>
  )
}

describe('RightPanelProvider settings navigation target', () => {
  it('keeps legacy two-argument navigation and supports a clearable third target', () => {
    render(
      <RightPanelProvider>
        <NavigationHarness />
      </RightPanelProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open display' }))
    expect(screen.getByTestId('active-tab')).toHaveTextContent('settings')
    expect(screen.getByTestId('settings-tab')).toHaveTextContent('display')
    expect(screen.getByTestId('settings-target')).toHaveTextContent('none')

    fireEvent.click(screen.getByRole('button', { name: 'Open context window' }))
    expect(screen.getByTestId('settings-tab')).toHaveTextContent('ai')
    expect(screen.getByTestId('settings-target')).toHaveTextContent(
      'openai-compatible-context-window',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open profile context window' }))
    expect(screen.getByTestId('settings-target')).toHaveTextContent(
      'openai-compatible-context-window:profile-2',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Add custom model' }))
    expect(screen.getByTestId('settings-tab')).toHaveTextContent('ai')
    expect(screen.getByTestId('settings-target')).toHaveTextContent(
      'openai-compatible-add-profile',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Clear target' }))
    expect(screen.getByTestId('settings-target')).toHaveTextContent('none')
  })
})
