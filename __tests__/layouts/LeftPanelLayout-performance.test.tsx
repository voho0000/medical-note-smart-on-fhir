import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ClinicalSummaryFeature from '@/src/layouts/LeftPanelLayout'

const mockClearDetail = jest.fn()

jest.mock('@/src/shared/config/feature-registry', () => {
  const React = jest.requireActual<typeof import('react')>('react')
  const PatientFeature = () => React.createElement('div', { 'data-testid': 'patient-shell' })
  const ReportsFeature = () => React.createElement('div', { 'data-testid': 'reports-shell' })
  const MedsFeature = () => React.createElement('div', { 'data-testid': 'meds-shell' })
  const tabs = [
    { id: 'patient', labelKey: 'patient', order: 0, enabled: true },
    { id: 'reports', labelKey: 'reports', order: 1, enabled: true },
    { id: 'meds', labelKey: 'meds', order: 2, enabled: true },
  ]
  return {
    getEnabledTabs: () => tabs,
    getFeaturesForTab: (tabId: string) => {
      if (tabId === 'reports') return [{ id: 'reports', component: ReportsFeature }]
      if (tabId === 'meds') return [{ id: 'meds', component: MedsFeature }]
      return [{ id: 'patient', component: PatientFeature }]
    },
  }
})

jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({
    t: {
      common: { loading: '載入中...' },
      tabs: { patient: '病人資訊', reports: '報告', meds: '用藥' },
    },
  }),
}))

jest.mock('@/src/application/providers/right-detail.provider', () => ({
  useRightDetail: () => ({ clearDetail: mockClearDetail }),
}))

jest.mock('@/src/application/stores/resource-navigation.store', () => ({
  useResourceNavigationStore: (selector: (state: { pending: null; seq: number }) => unknown) => (
    selector({ pending: null, seq: 0 })
  ),
  leftTabForResourceType: () => null,
}))

jest.mock('@/features/left-browser-tour', () => ({
  useLeftBrowserTourStore: (selector: (state: { active: boolean; stepId: null }) => unknown) => (
    selector({ active: false, stepId: null })
  ),
}))

jest.mock('@/features/clinical-summary/components/FhirDataIssuesBanner', () => ({
  FhirDataIssuesBanner: () => <div data-testid="fhir-data-issues-banner" />,
}))

jest.mock('@/features/clinical-summary/components/SdkSourceLimitationsBanner', () => ({
  SdkSourceLimitationsBanner: () => null,
}))

jest.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => (
    <div data-slot="scroll-area-viewport">{children}</div>
  ),
}))

describe('LeftPanelLayout tab responsiveness', () => {
  let frameCallbacks: FrameRequestCallback[]
  let idleCallbacks: IdleRequestCallback[]

  beforeEach(() => {
    jest.clearAllMocks()
    frameCallbacks = []
    idleCallbacks = []
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frameCallbacks.push(callback)
      return frameCallbacks.length
    })
    Object.defineProperty(window, 'requestIdleCallback', {
      configurable: true,
      value: jest.fn((callback: IdleRequestCallback) => {
        idleCallbacks.push(callback)
        return idleCallbacks.length
      }),
    })
    Object.defineProperty(window, 'cancelIdleCallback', {
      configurable: true,
      value: jest.fn(),
    })
  })

  afterEach(() => {
    jest.restoreAllMocks()
    Object.defineProperty(window, 'requestIdleCallback', {
      configurable: true,
      value: undefined,
    })
    Object.defineProperty(window, 'cancelIdleCallback', {
      configurable: true,
      value: undefined,
    })
  })

  it('performance contract: idle-mounts Reports before the user switches tabs', async () => {
    render(<ClinicalSummaryFeature />)

    expect(screen.getByRole('tab', { name: '病人資訊' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByTestId('reports-shell')).not.toBeInTheDocument()

    act(() => {
      frameCallbacks.splice(0).forEach((callback) => callback(16))
    })
    expect(idleCallbacks).toHaveLength(1)

    act(() => {
      idleCallbacks.shift()?.({
        didTimeout: false,
        timeRemaining: () => 50,
      })
    })

    await waitFor(() => expect(screen.getByTestId('reports-shell')).toBeInTheDocument())
    expect(screen.getByTestId('reports-shell').closest('[data-slot="tabs-content"]'))
      .toHaveAttribute('data-state', 'inactive')

    const reportsTab = screen.getByRole('tab', { name: '報告' })
    fireEvent.mouseDown(reportsTab, { button: 0, ctrlKey: false })

    // The click only reveals an already-mounted shell; it does not pay the
    // report workspace's mount cost inside the input event.
    expect(reportsTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('reports-shell').closest('[data-slot="tabs-content"]'))
      .toHaveAttribute('data-state', 'active')
    expect(mockClearDetail).toHaveBeenCalledTimes(1)
  })

  it('keeps each clinical tab on its own scroll viewport', () => {
    render(<ClinicalSummaryFeature />)

    fireEvent.mouseDown(screen.getByRole('tab', { name: '報告' }), {
      button: 0,
      ctrlKey: false,
    })
    act(() => {
      frameCallbacks.splice(0).forEach((callback) => callback(16))
    })
    const reportsPanel = screen.getByTestId('reports-shell').closest('[data-slot="tabs-content"]')
    const reportsViewport = reportsPanel?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]')
    expect(reportsViewport).not.toBeNull()
    if (!reportsViewport) return
    reportsViewport.scrollTop = 180

    fireEvent.mouseDown(screen.getByRole('tab', { name: '用藥' }), {
      button: 0,
      ctrlKey: false,
    })
    act(() => {
      frameCallbacks.splice(0).forEach((callback) => callback(32))
    })
    const medsPanel = screen.getByTestId('meds-shell').closest('[data-slot="tabs-content"]')
    const medsViewport = medsPanel?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]')
    expect(medsViewport).not.toBeNull()
    if (!medsViewport) return
    expect(medsViewport.scrollTop).toBe(0)
    medsViewport.scrollTop = 260

    fireEvent.mouseDown(screen.getByRole('tab', { name: '報告' }), {
      button: 0,
      ctrlKey: false,
    })
    expect(reportsViewport.scrollTop).toBe(180)

    fireEvent.mouseDown(screen.getByRole('tab', { name: '用藥' }), {
      button: 0,
      ctrlKey: false,
    })
    expect(medsViewport.scrollTop).toBe(260)
  })

  it('selects an unmounted tab before mounting its heavy workspace', async () => {
    render(<ClinicalSummaryFeature />)

    const medsTab = screen.getByRole('tab', { name: '用藥' })
    fireEvent.mouseDown(medsTab, { button: 0, ctrlKey: false })

    expect(medsTab).toHaveAttribute('aria-selected', 'true')
    const loading = screen.getByRole('status', { name: '用藥 載入中...' })
    expect(loading).toBeInTheDocument()
    expect(loading).toHaveTextContent('用藥 · 載入中...')
    expect(screen.getByTestId('clinical-tab-loading-indicator').querySelector('.animate-spin'))
      .toBeInTheDocument()
    expect(screen.queryByTestId('meds-shell')).not.toBeInTheDocument()

    act(() => {
      frameCallbacks.splice(0).forEach((callback) => callback(16))
    })

    await waitFor(() => expect(screen.getByTestId('meds-shell')).toBeInTheDocument())
  })

  it('keeps the tab bar above late FHIR warning content', () => {
    render(<ClinicalSummaryFeature />)

    const tabList = screen.getByRole('tablist')
    const warning = screen.getByTestId('fhir-data-issues-banner')
    expect(tabList.compareDocumentPosition(warning) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy()
  })
})
