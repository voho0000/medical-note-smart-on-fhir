import { fireEvent, render, screen } from '@testing-library/react'
import { FirstRunOnboardingDialog } from '@/app/_components/FirstRunOnboardingDialog'
import { useSafetyPrefsStore } from '@/src/application/hooks/safety-alerts/use-safety-alerts.hook'
import { useSummaryPrefsStore } from '@/src/application/hooks/medical-summary/use-medical-summary.hook'

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
  autoScanTitle: '是否自動產生 AI 摘要？',
  autoScanBody: '說明',
  autoScanPrivacyNote: '雲端提醒',
  autoScanOnLabel: '自動產生',
  autoScanOnDesc: '自動產生說明',
  autoScanOffLabel: '需要時手動產生',
  autoScanOffDesc: '手動產生說明',
  autoScanConsent: '我同意資料傳送至雲端 AI',
  autoScanConsentRequired: '請先勾選同意，才能繼續。',
  signInTitle: '登入或以訪客身分繼續',
  signInBody: '登入說明',
  signInBenefitsTitle: '登入與資料同步',
  signInBenefits: ['同步'],
  signInCta: '登入',
  guestCta: '以訪客身分繼續',
  guestHint: '訪客說明',
}

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
  useOnboarding: () => ({ completed: false, markComplete: jest.fn() }),
}))

jest.mock('@/features/auth/components/AuthDialog', () => ({
  AuthDialog: () => null,
}))

function reachAutoGenerateStep() {
  render(<FirstRunOnboardingDialog />)
  fireEvent.click(screen.getByRole('button', { name: '開始' }))
  fireEvent.click(screen.getByRole('button', { name: /我是醫療人員/ }))
}

describe('FirstRunOnboardingDialog auto-generate consent', () => {
  beforeEach(() => {
    useSafetyPrefsStore.setState({ autoScan: false })
    useSummaryPrefsStore.setState({ autoGenerate: false })
  })

  it('requires explicit cloud-AI consent before continuing with auto-generation', () => {
    reachAutoGenerateStep()
    fireEvent.click(screen.getByRole('button', { name: /自動產生/ }))

    const next = screen.getByRole('button', { name: '下一步' })
    expect(next).toBeDisabled()
    expect(screen.getByText('請先勾選同意，才能繼續。')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: '我同意資料傳送至雲端 AI' }))

    expect(next).toBeEnabled()
    expect(screen.queryByText('請先勾選同意，才能繼續。')).not.toBeInTheDocument()

    fireEvent.click(next)
    expect(useSummaryPrefsStore.getState().autoGenerate).toBe(true)
    expect(useSafetyPrefsStore.getState().autoScan).toBe(true)
  })

  it('does not require cloud-AI consent when manual generation is selected', () => {
    reachAutoGenerateStep()

    fireEvent.click(screen.getByRole('button', { name: /需要時手動產生/ }))

    expect(screen.queryByRole('checkbox', { name: '我同意資料傳送至雲端 AI' })).not.toBeInTheDocument()
    const next = screen.getByRole('button', { name: '下一步' })
    expect(next).toBeEnabled()

    fireEvent.click(next)
    expect(useSummaryPrefsStore.getState().autoGenerate).toBe(false)
    expect(useSafetyPrefsStore.getState().autoScan).toBe(false)
  })
})
