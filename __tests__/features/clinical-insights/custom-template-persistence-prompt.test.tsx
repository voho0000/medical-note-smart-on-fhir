import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'

const mockUseAuth = jest.fn()
const mockUseClinicalInsightsConfig = jest.fn()

jest.mock('@/src/application/providers/auth.provider', () => ({
  useAuth: () => mockUseAuth(),
}))

jest.mock('@/src/application/providers/clinical-insights-config.provider', () => ({
  useClinicalInsightsConfig: () => mockUseClinicalInsightsConfig(),
}))

jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({
    t: {
      audience: { medical: 'Medical', patient: 'Patient' },
      common: { undo: 'Undo' },
      modelPicker: { insightsTooltip: 'Choose model' },
      promptGallery: { browseGallery: 'Browse gallery' },
      settings: {
        addTab: 'Add module',
        autoModuleLimit: 'Auto limit',
        customModuleAudienceShort: 'For this role',
        customTemplateContinueGuest: 'Not now, use on this page',
        customTemplateDeleted: 'Template deleted',
        customTemplatePersistenceDesc: 'Choose where to keep templates.',
        customTemplatePersistenceTitle: 'Sign in to keep templates?',
        customTemplateSignIn: 'Sign in and sync',
        loadingCustomSummaryTemplates: 'Loading templates',
        moduleAccountSync: 'Account sync',
        moduleAutoShort: 'auto',
        moduleBrowserAutosave: 'Page only',
        moduleLibraryOnly: 'Library only',
        moduleListTitle: 'Module list',
        moduleSelectPlaceholder: 'Select a module',
        moduleVisibleShort: 'shown',
        resetToDefaults: 'Reset',
        saveTemplates: 'Save',
        saving: 'Saving',
        summaryModuleLimit: 'Summary limit',
        tabsInUse: 'modules',
      },
    },
  }),
}))

jest.mock('@/src/application/providers/audience.provider', () => ({
  useAudience: () => ({ audience: 'medical' }),
}))

jest.mock('@/src/application/stores/model-prefs.store', () => ({
  MODEL_PREF_DEFAULTS: { insights: 'default-model' },
  useModelPref: () => 'default-model',
  useSetModelFor: () => jest.fn(),
}))

jest.mock('@/src/shared/components/ModelPicker', () => ({
  ModelPicker: () => null,
}))

jest.mock('@/features/clinical-insights/components/CustomInsightModuleEditor', () => ({
  CustomInsightModuleEditor: ({
    onRemove,
    onUpdate,
  }: {
    onRemove: (id: string) => void
    onUpdate: (id: string, patch: { title: string }) => void
  }) => (
    <>
      <button type="button" onClick={() => onUpdate('changes', { title: 'Edited title' })}>
        Edit module
      </button>
      <button type="button" onClick={() => onRemove('changes')}>
        Delete module
      </button>
    </>
  ),
}))

jest.mock('@/features/prompt-gallery', () => ({
  PromptGalleryDialog: () => null,
  SharePromptDialog: () => null,
}))

jest.mock('@/features/prompt-gallery/components/LoginRequiredDialog', () => ({
  LoginRequiredDialog: ({
    open,
    title,
    cancelLabel,
    loginLabel,
    onOpenChange,
    onCancel,
    onLoginStart,
  }: {
    open: boolean
    title: string
    cancelLabel: string
    loginLabel: string
    onOpenChange: (open: boolean) => void
    onCancel: () => void
    onLoginStart: () => void
  }) => open ? (
    <div role="dialog" aria-label={title}>
      <button type="button" onClick={() => {
        onCancel()
        onOpenChange(false)
      }}>{cancelLabel}</button>
      <button type="button" onClick={() => {
        onLoginStart()
        onOpenChange(false)
      }}>{loginLabel}</button>
    </div>
  ) : null,
}))

jest.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectValue: () => null,
}))

import { CustomInsightModulesManager } from '@/features/clinical-insights/components/CustomInsightModulesManager'

function buildConfig(overrides: Record<string, unknown> = {}) {
  return {
    panels: [{
      id: 'changes',
      title: 'What changed',
      prompt: 'Summarize changes.',
      showInSummary: true,
      autoGenerate: false,
      order: 0,
      audience: 'medical',
    }],
    guestEditingApproved: false,
    approveGuestEditing: jest.fn(),
    updatePanel: jest.fn(),
    updatePanelAndSave: jest.fn(),
    addPanel: jest.fn(() => 'new-panel'),
    removePanel: jest.fn(),
    restorePanel: jest.fn(),
    resetPanels: jest.fn(),
    savePanels: jest.fn(),
    maxPanels: 999,
    reorderPanels: jest.fn(),
    isSaving: false,
    isLoading: false,
    syncStatus: 'idle',
    lastSavedAt: null,
    ...overrides,
  }
}

describe('custom summary template persistence prompt', () => {
  it('asks a guest before the first edit and resumes it for page-only use', () => {
    const config = buildConfig()
    mockUseAuth.mockReturnValue({ user: null })
    mockUseClinicalInsightsConfig.mockReturnValue(config)

    render(<CustomInsightModulesManager />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit module' }))

    expect(config.updatePanel).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Sign in to keep templates?' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Not now, use on this page' }))

    expect(config.approveGuestEditing).toHaveBeenCalledTimes(1)
    expect(config.updatePanel).toHaveBeenCalledWith('changes', { title: 'Edited title' })
  })

  it('edits immediately when an account is signed in', () => {
    const config = buildConfig()
    mockUseAuth.mockReturnValue({ user: { uid: 'account-1' } })
    mockUseClinicalInsightsConfig.mockReturnValue(config)

    render(<CustomInsightModulesManager />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit module' }))

    expect(config.updatePanel).toHaveBeenCalledWith('changes', { title: 'Edited title' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('resumes the pending edit after the selected account finishes loading', () => {
    const config = buildConfig()
    mockUseAuth.mockReturnValue({ user: null })
    mockUseClinicalInsightsConfig.mockReturnValue(config)
    const view = render(<CustomInsightModulesManager />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit module' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sign in and sync' }))
    expect(config.updatePanel).not.toHaveBeenCalled()

    mockUseAuth.mockReturnValue({ user: { uid: 'account-1' } })
    config.isLoading = true
    view.rerender(<CustomInsightModulesManager />)
    expect(config.updatePanel).not.toHaveBeenCalled()

    config.isLoading = false
    view.rerender(<CustomInsightModulesManager />)
    expect(config.updatePanel).toHaveBeenCalledWith('changes', { title: 'Edited title' })
  })

  it('offers a working in-manager undo action after deleting a signed-in template', () => {
    const config = buildConfig()
    config.panels.push({
      id: 'snapshot',
      title: 'Snapshot',
      prompt: 'Summarize the current state.',
      showInSummary: false,
      autoGenerate: false,
      order: 1,
      audience: 'medical',
    })
    mockUseAuth.mockReturnValue({ user: { uid: 'account-1' } })
    mockUseClinicalInsightsConfig.mockReturnValue(config)
    render(<CustomInsightModulesManager />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete module' }))
    expect(config.removePanel).toHaveBeenCalledWith('changes')
    const recoveryStatus = screen.getByRole('status')
    expect(within(recoveryStatus).getByText('Template deleted')).toBeInTheDocument()
    expect(within(recoveryStatus).getByText('What changed')).toBeInTheDocument()

    fireEvent.click(within(recoveryStatus).getByRole('button', { name: 'Undo' }))
    expect(config.restorePanel).toHaveBeenCalledWith(expect.objectContaining({ id: 'changes' }))
    expect(screen.queryByText('Template deleted')).not.toBeInTheDocument()
  })
})
