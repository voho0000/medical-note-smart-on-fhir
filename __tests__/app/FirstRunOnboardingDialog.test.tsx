import { act, fireEvent, render, screen } from '@testing-library/react'
import { FirstRunOnboardingDialog } from '@/app/_components/FirstRunOnboardingDialog'
import { useSafetyPrefsStore } from '@/src/application/hooks/safety-alerts/use-safety-alerts.hook'
import { useSummaryPrefsStore } from '@/src/application/hooks/medical-summary/use-medical-summary.hook'
import {
  AUTO_AI_REAL_DATA_DECISION_KEY,
  clearLocalImportAiConsent,
  getLocalImportAiConsent,
  markLocalImportAiConsentReady,
  recordLocalImportAiDecision,
  startLocalImportAiConsent,
} from '@/src/application/hooks/ai-generation/auto-ai-consent'
import { DEMO_FLAG_KEY } from '@/src/infrastructure/fhir/services/local-bundle.service'

const mockOnboarding = {
  step: '步驟',
  back: '上一步',
  next: '下一步',
  start: '開始',
  finish: '完成',
  welcomeTitle: '歡迎使用 MediPrisma',
  welcomeBody: '介紹',
  privacyTitle: '隱私與使用提醒',
  privacyPoints: ['提醒'],
  autoScanTitle: '醫療摘要產生方式',
  autoScanBody: '說明',
  localAutoScanBody: '本次匯入只適用這次選擇，重新匯入會再次詢問',
  autoScanPrivacyNote: '雲端提醒',
  autoScanOnLabel: '自動產生醫療摘要',
  autoScanOnDesc: '自動產生說明',
  autoScanOffLabel: '需要時再產生',
  autoScanOffDesc: '手動產生說明',
  autoScanConfirmationTitle: '啟用前請確認',
  autoScanConsent: '我了解上述資料使用方式，並選擇啟用自動摘要',
  autoScanConsentRequired: '請先確認上述資料使用方式，才能啟用自動摘要。',
  autoScanConfirmCta: '確認並啟用',
  autoScanManualCta: '繼續',
  demoAutoScanTitle: '安全洞察會自動準備好',
  demoAutoScanBody: '試用資料說明',
  demoAutoScanReadyTitle: '試用資料：自動顯示',
  demoAutoScanReadyDesc: '不會上傳資料，也不會使用 AI 額度',
  demoAutoScanRealDataNote: '使用真實資料時會再次詢問',
  demoAutoScanCta: '開始體驗',
  signInTitle: '登入或以訪客身分繼續',
  signInBody: '登入說明',
  signInBenefitsTitle: '登入與資料同步',
  signInBenefits: ['同步'],
  signInCta: '登入',
  guestCta: '以訪客身分繼續',
  guestHint: '訪客說明',
}

let mockOnboardingCompleted = false

jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({
    t: {
      onboarding: mockOnboarding,
      audience: {
        onboarding: {
          title: '請問您的使用身份是？',
          description: '身份說明',
          medicalCardTitle: '我是醫療人員',
          medicalCardDescription: '醫療人員說明',
          patientCardTitle: '我是民眾',
          patientCardDescription: '民眾說明',
        },
      },
    },
  }),
}))

jest.mock('@/src/application/providers/audience.provider', () => ({
  useAudience: () => ({ setAudience: jest.fn() }),
}))

jest.mock('@/src/application/providers/auth.provider', () => ({
  useAuth: () => ({ user: null }),
}))

jest.mock('@/src/application/hooks/patient/use-patient-query.hook', () => ({
  usePatient: () => ({ patient: { id: 'patient-1' }, loading: false, error: null }),
}))

jest.mock('@/src/application/hooks/onboarding/use-onboarding.hook', () => ({
  useOnboarding: () => ({ ready: true, completed: mockOnboardingCompleted, markComplete: jest.fn() }),
}))

jest.mock('@/features/auth/components/AuthDialog', () => ({
  AuthDialog: () => null,
}))

function reachAutoGenerateStep() {
  render(<FirstRunOnboardingDialog />)
  fireEvent.click(screen.getByRole('button', { name: '開始' }))
  fireEvent.click(screen.getByRole('button', { name: /我是醫療人員/ }))
}

function makeLocalImportReady(importId: string) {
  startLocalImportAiConsent(importId)
  expect(markLocalImportAiConsentReady(importId)).toBe(true)
}

describe('FirstRunOnboardingDialog auto-generate consent', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    clearLocalImportAiConsent()
    mockOnboardingCompleted = false
    useSafetyPrefsStore.setState({ autoScan: false })
    useSummaryPrefsStore.setState({ autoGenerate: false })
  })

  it('requires explicit cloud-AI consent before continuing with auto-generation', () => {
    reachAutoGenerateStep()
    fireEvent.click(screen.getByRole('button', { name: /自動產生/ }))

    const next = screen.getByRole('button', { name: '確認並啟用' })
    expect(next).toBeDisabled()
    expect(screen.getByText('請先確認上述資料使用方式，才能啟用自動摘要。')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: '我了解上述資料使用方式，並選擇啟用自動摘要' }))

    expect(next).toBeEnabled()
    expect(screen.queryByText('請先確認上述資料使用方式，才能啟用自動摘要。')).not.toBeInTheDocument()

    fireEvent.click(next)
    expect(useSummaryPrefsStore.getState().autoGenerate).toBe(true)
    expect(useSafetyPrefsStore.getState().autoScan).toBe(true)
    expect(localStorage.getItem(AUTO_AI_REAL_DATA_DECISION_KEY)).toBe('auto')
  })

  it('does not require cloud-AI consent when manual generation is selected', () => {
    reachAutoGenerateStep()

    fireEvent.click(screen.getByRole('button', { name: /需要時再產生/ }))

    expect(screen.queryByRole('checkbox', { name: '我了解上述資料使用方式，並選擇啟用自動摘要' })).not.toBeInTheDocument()
    const next = screen.getByRole('button', { name: '繼續' })
    expect(next).toBeEnabled()

    fireEvent.click(next)
    expect(useSummaryPrefsStore.getState().autoGenerate).toBe(false)
    expect(useSafetyPrefsStore.getState().autoScan).toBe(false)
    expect(localStorage.getItem(AUTO_AI_REAL_DATA_DECISION_KEY)).toBe('manual')
  })

  it('shows demo insights automatically without asking for real-data consent', () => {
    // LocalBundleService uses this marker for synchronous source detection.
    localStorage.setItem('fhir_bundle_override', '1')
    localStorage.setItem(DEMO_FLAG_KEY, '1')

    reachAutoGenerateStep()

    expect(screen.getByText('試用資料：自動顯示')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /自動產生/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(localStorage.getItem(AUTO_AI_REAL_DATA_DECISION_KEY)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '下一步' }))

    expect(useSummaryPrefsStore.getState().autoGenerate).toBe(false)
    expect(useSafetyPrefsStore.getState().autoScan).toBe(false)
    expect(localStorage.getItem(AUTO_AI_REAL_DATA_DECISION_KEY)).toBeNull()
  })

  it('asks only the contextual real-data question after demo onboarding is complete', () => {
    mockOnboardingCompleted = true

    render(<FirstRunOnboardingDialog />)

    expect(screen.getByText('醫療摘要產生方式')).toBeInTheDocument()
    expect(screen.queryByText('歡迎使用 MediPrisma')).not.toBeInTheDocument()
    expect(screen.getByText('步驟 1 / 1')).toBeInTheDocument()
  })

  it('does not inherit a browser-wide auto choice for a new local import', () => {
    mockOnboardingCompleted = true
    localStorage.setItem('fhir_bundle_override', '1')
    localStorage.setItem(AUTO_AI_REAL_DATA_DECISION_KEY, 'auto')
    makeLocalImportReady('import-a')

    render(<FirstRunOnboardingDialog />)

    expect(screen.getByText('本次匯入只適用這次選擇，重新匯入會再次詢問')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /需要時再產生/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /自動產生/ })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getByText('步驟 1 / 1')).toBeInTheDocument()
  })

  it('resets the local choice and confirmation synchronously for the next import', () => {
    mockOnboardingCompleted = true
    localStorage.setItem('fhir_bundle_override', '1')
    makeLocalImportReady('import-a')
    render(<FirstRunOnboardingDialog />)

    fireEvent.click(screen.getByRole('button', { name: /自動產生/ }))
    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.getByRole('button', { name: '確認並啟用' })).toBeEnabled()

    act(() => { startLocalImportAiConsent('import-b') })

    expect(screen.queryByText('醫療摘要產生方式')).not.toBeInTheDocument()
    expect(getLocalImportAiConsent()?.decision).toBe('preparing')

    act(() => { markLocalImportAiConsentReady('import-b') })

    expect(screen.getByRole('button', { name: /需要時再產生/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /自動產生/ })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(getLocalImportAiConsent()?.importId).toBe('import-b')
    expect(getLocalImportAiConsent()?.decision).toBe('pending')
  })

  it('authorizes only the current local import after explicit confirmation', () => {
    mockOnboardingCompleted = true
    localStorage.setItem('fhir_bundle_override', '1')
    makeLocalImportReady('import-a')
    render(<FirstRunOnboardingDialog />)

    fireEvent.click(screen.getByRole('button', { name: /自動產生/ }))
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: '確認並啟用' }))

    expect(getLocalImportAiConsent()).toMatchObject({
      importId: 'import-a',
      decision: 'auto',
    })
    expect(localStorage.getItem(AUTO_AI_REAL_DATA_DECISION_KEY)).toBeNull()
    expect(useSummaryPrefsStore.getState().autoGenerate).toBe(false)
    expect(useSafetyPrefsStore.getState().autoScan).toBe(false)
    expect(screen.queryByText('醫療摘要產生方式')).not.toBeInTheDocument()
  })

  it('does not ask again for the same decided import but asks for a new import', () => {
    mockOnboardingCompleted = true
    localStorage.setItem('fhir_bundle_override', '1')
    makeLocalImportReady('import-a')
    expect(recordLocalImportAiDecision('import-a', 'manual')).toBe(true)

    render(<FirstRunOnboardingDialog />)
    expect(screen.queryByText('醫療摘要產生方式')).not.toBeInTheDocument()

    act(() => {
      startLocalImportAiConsent('import-b')
      markLocalImportAiConsentReady('import-b')
    })

    expect(screen.getByText('醫療摘要產生方式')).toBeInTheDocument()
    expect(screen.getByText('步驟 1 / 1')).toBeInTheDocument()
  })

  it('does not overwrite the SMART auto preference with a local manual choice', () => {
    mockOnboardingCompleted = true
    localStorage.setItem('fhir_bundle_override', '1')
    localStorage.setItem(AUTO_AI_REAL_DATA_DECISION_KEY, 'auto')
    useSummaryPrefsStore.setState({ autoGenerate: true })
    useSafetyPrefsStore.setState({ autoScan: true })
    makeLocalImportReady('import-a')
    render(<FirstRunOnboardingDialog />)

    fireEvent.click(screen.getByRole('button', { name: '繼續' }))

    expect(getLocalImportAiConsent()?.decision).toBe('manual')
    expect(localStorage.getItem(AUTO_AI_REAL_DATA_DECISION_KEY)).toBe('auto')
    expect(useSummaryPrefsStore.getState().autoGenerate).toBe(true)
    expect(useSafetyPrefsStore.getState().autoScan).toBe(true)
  })
})
