import { fireEvent, render, screen } from '@testing-library/react'
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
    locale: 'en',
    t: {
      medicalSummary: {
        customManagerTitle: 'Manage custom summary modules',
        customManagerDescription: 'Edit templates and choose active modules.',
      },
      settings: {
        customTemplateGuestSignIn: 'Sign in to use across devices',
        customTemplateGuestStatus: 'Available only on this page and cleared on refresh',
        customTemplateRetrySync: 'Retry',
        customTemplateSyncDirty: 'Changes not synced yet',
        customTemplateSyncError: 'Not synced; changes remain on this page',
        customTemplateSyncSaved: 'Synced to your account',
        customTemplateSyncSaving: 'Syncing to your account…',
        loadingCustomSummaryTemplates: 'Loading templates',
      },
    },
  }),
}))

jest.mock('@/components/ui/sheet', () => ({
  Sheet: ({
    children,
    onOpenChange,
  }: {
    children: ReactNode
    onOpenChange: (open: boolean) => void
  }) => (
    <div>
      {children}
      <button type="button" onClick={() => onOpenChange(false)}>Close drawer</button>
    </div>
  ),
  SheetContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  SheetHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
  SheetTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}))

jest.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

jest.mock('@/features/clinical-insights/components/CustomInsightModulesManager', () => ({
  CustomInsightModulesManager: () => <div>Template editor</div>,
}))

jest.mock('@/features/auth/components/AuthDialog', () => ({
  AuthDialog: ({ open }: { open: boolean }) => open ? <div role="dialog">Sign in dialog</div> : null,
}))

import { CustomInsightModulesManagerDrawer } from '@/features/medical-summary/components/CustomInsightModulesManagerDrawer'

describe('custom summary template sync status', () => {
  it('shows a retry action only when account sync fails', () => {
    const savePanels = jest.fn().mockResolvedValue(true)
    mockUseAuth.mockReturnValue({ user: { uid: 'account-1' } })
    mockUseClinicalInsightsConfig.mockReturnValue({
      isLoading: false,
      lastSavedAt: null,
      savePanels,
      syncStatus: 'error',
    })

    render(<CustomInsightModulesManagerDrawer open onOpenChange={jest.fn()} />)

    expect(screen.getByText('Not synced; changes remain on this page')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(savePanels).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: /save templates/i })).not.toBeInTheDocument()
  })

  it('tells guests that templates are page-only and offers sign-in', () => {
    mockUseAuth.mockReturnValue({ user: null })
    mockUseClinicalInsightsConfig.mockReturnValue({
      isLoading: false,
      lastSavedAt: null,
      savePanels: jest.fn(),
      syncStatus: 'idle',
    })

    render(<CustomInsightModulesManagerDrawer open onOpenChange={jest.fn()} />)

    expect(screen.getByText('Available only on this page and cleared on refresh')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Sign in to use across devices' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('flushes pending account changes when the drawer closes', () => {
    const savePanels = jest.fn().mockResolvedValue(true)
    const onOpenChange = jest.fn()
    mockUseAuth.mockReturnValue({ user: { uid: 'account-1' } })
    mockUseClinicalInsightsConfig.mockReturnValue({
      isLoading: false,
      lastSavedAt: null,
      savePanels,
      syncStatus: 'dirty',
    })

    render(<CustomInsightModulesManagerDrawer open onOpenChange={onOpenChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Close drawer' }))

    expect(savePanels).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('does not save pending account changes or dismiss the guided preview', () => {
    const savePanels = jest.fn().mockResolvedValue(true)
    const onOpenChange = jest.fn()
    mockUseAuth.mockReturnValue({ user: { uid: 'account-1' } })
    mockUseClinicalInsightsConfig.mockReturnValue({
      isLoading: false,
      lastSavedAt: null,
      savePanels,
      syncStatus: 'dirty',
    })

    const { rerender } = render(<CustomInsightModulesManagerDrawer open guidedPreview onOpenChange={onOpenChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Close drawer' }))
    rerender(<CustomInsightModulesManagerDrawer open={false} guidedPreview onOpenChange={onOpenChange} />)

    expect(savePanels).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
  })
})
