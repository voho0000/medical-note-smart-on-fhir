import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

const mockUseAuth = jest.fn()
const mockSubscribe = jest.fn()
const mockApplyChanges = jest.fn()

jest.mock('@/src/application/providers/auth.provider', () => ({
  useAuth: () => mockUseAuth(),
}))

jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({ locale: 'en' }),
}))

jest.mock('@/src/application/providers/audience.provider', () => ({
  useAudience: () => ({ audience: 'medical' }),
}))

jest.mock('@/src/infrastructure/firebase/clinical-insights-sync', () => ({
  subscribeToClinicalInsightPanels: (...args: unknown[]) => mockSubscribe(...args),
  applyClinicalInsightPanelChanges: (...args: unknown[]) => mockApplyChanges(...args),
}))

import {
  ClinicalInsightsConfigProvider,
  getDefaultClinicalInsightPanels,
  useClinicalInsightsConfig,
  type InsightPanelConfig,
} from '@/src/application/providers/clinical-insights-config.provider'

function wrapper({ children }: { children: ReactNode }) {
  return <ClinicalInsightsConfigProvider>{children}</ClinicalInsightsConfigProvider>
}

function accountDefaults(): InsightPanelConfig[] {
  return [
    ...getDefaultClinicalInsightPanels('en', 'medical'),
    ...getDefaultClinicalInsightPanels('en', 'patient'),
  ]
}

describe('ClinicalInsightsConfigProvider account sync', () => {
  let accountListener: ((panels: InsightPanelConfig[]) => void) | null

  beforeEach(() => {
    accountListener = null
    mockUseAuth.mockReturnValue({
      user: { uid: 'account-1' },
      loading: false,
    })
    mockApplyChanges.mockResolvedValue(true)
    mockSubscribe.mockImplementation((
      _uid: string,
      onUpdate: (panels: InsightPanelConfig[]) => void,
    ) => {
      accountListener = onUpdate
      return jest.fn()
    })
  })

  it('auto-saves edits to the signed-in account after its library loads', async () => {
    const { result } = renderHook(() => useClinicalInsightsConfig(), { wrapper })

    await waitFor(() => expect(mockSubscribe).toHaveBeenCalledWith('account-1', expect.any(Function)))
    act(() => accountListener?.(accountDefaults()))

    act(() => result.current.updatePanel('changes', {
      title: 'My cross-device summary',
      outputFormat: 'plain-text',
      languagePolicy: 'follow-template',
    }))

    await waitFor(() => expect(mockApplyChanges).toHaveBeenCalled(), { timeout: 2000 })
    expect(mockApplyChanges).toHaveBeenLastCalledWith(
      'account-1',
      expect.arrayContaining([
        expect.objectContaining({
          id: 'changes',
          title: 'My cross-device summary',
          outputFormat: 'plain-text',
          languagePolicy: 'follow-template',
        }),
      ]),
      [],
    )
  })

  it('loads account templates delivered by another device', async () => {
    const { result } = renderHook(() => useClinicalInsightsConfig(), { wrapper })
    await waitFor(() => expect(accountListener).not.toBeNull())

    const remotePanels = accountDefaults().map((panel) => (
      panel.id === 'changes' ? { ...panel, title: 'Synced on my laptop' } : panel
    ))
    act(() => accountListener?.(remotePanels))

    expect(result.current.panels.find((panel) => panel.id === 'changes')?.title)
      .toBe('Synced on my laptop')
  })

  it('defaults new templates to exact plain text and the language written in the prompt', async () => {
    const { result } = renderHook(() => useClinicalInsightsConfig(), { wrapper })
    await waitFor(() => expect(accountListener).not.toBeNull())
    act(() => accountListener?.(accountDefaults()))

    let panelId: string | null = null
    act(() => { panelId = result.current.addPanel() })

    expect(result.current.panels.find((panel) => panel.id === panelId)).toMatchObject({
      outputFormat: 'plain-text',
      languagePolicy: 'follow-template',
    })
  })

  it('migrates legacy account templates to the backward-compatible Markdown contract', async () => {
    const { result } = renderHook(() => useClinicalInsightsConfig(), { wrapper })
    await waitFor(() => expect(accountListener).not.toBeNull())
    const legacy = accountDefaults().map(({ outputFormat: _format, languagePolicy: _language, ...panel }) => panel)
    act(() => accountListener?.(legacy as InsightPanelConfig[]))

    expect(result.current.panels[0]).toMatchObject({
      outputFormat: 'markdown',
      languagePolicy: 'interface-language',
    })
  })

  it('keeps guest edits in memory and never promotes them into the next login', async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false })

    const { result, rerender } = renderHook(() => useClinicalInsightsConfig(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.guestEditingApproved).toBe(false)
    act(() => result.current.approveGuestEditing())
    expect(result.current.guestEditingApproved).toBe(true)
    let guestPanelId: string | null = null
    act(() => {
      guestPanelId = result.current.addPanel({
        title: 'Guest custom summary',
        prompt: 'Summarize the follow-up plan.',
      })
    })
    expect(result.current.panels.some((panel) => panel.id === guestPanelId)).toBe(true)
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)

    mockUseAuth.mockReturnValue({ user: { uid: 'account-1' }, loading: false })
    rerender()

    expect(result.current.isLoading).toBe(true)
    expect(result.current.guestEditingApproved).toBe(false)
    expect(result.current.panels).toEqual([])
    await waitFor(() => expect(mockSubscribe).toHaveBeenCalledWith('account-1', expect.any(Function)))
    act(() => accountListener?.(accountDefaults()))

    expect(result.current.isLoading).toBe(false)
    expect(result.current.panels.some((panel) => panel.id === guestPanelId)).toBe(false)
    expect(mockApplyChanges).not.toHaveBeenCalled()
  })

  it('hides the previous account immediately while a different account loads', async () => {
    const { result, rerender } = renderHook(() => useClinicalInsightsConfig(), { wrapper })
    await waitFor(() => expect(accountListener).not.toBeNull())
    act(() => accountListener?.(accountDefaults().map((panel) => (
      panel.id === 'changes' ? { ...panel, title: 'Account one private template' } : panel
    ))))
    expect(result.current.panels.some((panel) => panel.title === 'Account one private template')).toBe(true)

    mockUseAuth.mockReturnValue({ user: { uid: 'account-2' }, loading: false })
    rerender()

    expect(result.current.isLoading).toBe(true)
    expect(result.current.panels).toEqual([])
    await waitFor(() => expect(mockSubscribe).toHaveBeenCalledWith('account-2', expect.any(Function)))

    act(() => accountListener?.(accountDefaults().map((panel) => (
      panel.id === 'changes' ? { ...panel, title: 'Account two template' } : panel
    ))))

    expect(result.current.isLoading).toBe(false)
    expect(result.current.panels.some((panel) => panel.title === 'Account one private template')).toBe(false)
    expect(result.current.panels.some((panel) => panel.title === 'Account two template')).toBe(true)
  })

  it('keeps a deleted template hidden when a stale account snapshot arrives', async () => {
    const customPanel: InsightPanelConfig = {
      id: 'custom-to-delete',
      title: 'Delete me',
      prompt: 'Old prompt',
      showInSummary: false,
      autoGenerate: false,
      order: 3,
      audience: 'medical',
      templateLibraryRevision: 1,
      outputFormat: 'plain-text',
      languagePolicy: 'follow-template',
    }
    const remotePanels = [...accountDefaults(), customPanel]
    const { result } = renderHook(() => useClinicalInsightsConfig(), { wrapper })
    await waitFor(() => expect(accountListener).not.toBeNull())
    act(() => accountListener?.(remotePanels))

    act(() => {
      result.current.removePanel(customPanel.id)
      accountListener?.(remotePanels)
    })

    expect(result.current.panels.some((panel) => panel.id === customPanel.id)).toBe(false)
    await waitFor(() => expect(mockApplyChanges).toHaveBeenCalledWith(
      'account-1',
      expect.any(Array),
      expect.arrayContaining([customPanel.id]),
    ), { timeout: 2000 })
  })

  it('restores a deleted template with the same identity, content, order, and account sync', async () => {
    const customPanel: InsightPanelConfig = {
      id: 'custom-to-restore',
      title: 'Restore me',
      prompt: 'Keep this exact prompt.',
      showInSummary: false,
      autoGenerate: false,
      order: 3,
      audience: 'medical',
      templateLibraryRevision: 1,
      outputFormat: 'plain-text',
      languagePolicy: 'follow-template',
    }
    const { result } = renderHook(() => useClinicalInsightsConfig(), { wrapper })
    await waitFor(() => expect(accountListener).not.toBeNull())
    act(() => accountListener?.([...accountDefaults(), customPanel]))

    act(() => result.current.removePanel(customPanel.id))
    expect(result.current.panels.some((panel) => panel.id === customPanel.id)).toBe(false)
    await waitFor(() => expect(mockApplyChanges).toHaveBeenCalledWith(
      'account-1',
      expect.any(Array),
      expect.arrayContaining([customPanel.id]),
    ), { timeout: 2000 })
    await waitFor(() => expect(result.current.syncStatus).toBe('saved'))
    mockApplyChanges.mockClear()

    act(() => result.current.restorePanel(customPanel))
    expect(result.current.panels.find((panel) => panel.id === customPanel.id)).toEqual(customPanel)
    await waitFor(() => expect(mockApplyChanges).toHaveBeenCalledWith(
      'account-1',
      expect.arrayContaining([customPanel]),
      [],
    ), { timeout: 2000 })
  })

  it('merges unrelated remote changes without overwriting a pending local edit', async () => {
    const { result } = renderHook(() => useClinicalInsightsConfig(), { wrapper })
    await waitFor(() => expect(accountListener).not.toBeNull())
    act(() => accountListener?.(accountDefaults()))

    act(() => result.current.updatePanel('changes', { title: 'Local title' }))
    act(() => accountListener?.(accountDefaults().map((panel) => (
      panel.id === 'snapshot' ? { ...panel, prompt: 'Changed on another device' } : panel
    ))))

    expect(result.current.panels.find((panel) => panel.id === 'changes')?.title).toBe('Local title')
    expect(result.current.panels.find((panel) => panel.id === 'snapshot')?.prompt)
      .toBe('Changed on another device')
  })

  it('shows a recoverable error and retries the same pending changes', async () => {
    mockApplyChanges.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const { result } = renderHook(() => useClinicalInsightsConfig(), { wrapper })
    await waitFor(() => expect(accountListener).not.toBeNull())
    act(() => accountListener?.(accountDefaults()))

    act(() => result.current.updatePanel('changes', { title: 'Retry this title' }))
    await waitFor(() => expect(result.current.syncStatus).toBe('error'), { timeout: 2000 })

    await act(async () => {
      await expect(result.current.savePanels()).resolves.toBe(true)
    })
    expect(result.current.syncStatus).toBe('saved')
    expect(mockApplyChanges).toHaveBeenCalledTimes(2)
  })
})
