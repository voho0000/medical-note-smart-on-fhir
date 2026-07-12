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
  autoScanTitle: '醫療摘要產生方式',
  autoScanBody: '說明',
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

    const next = screen.getByRole('button', { name: '確認並啟用' })
    expect(next).toBeDisabled()
    expect(screen.getByText('請先確認上述資料使用方式，才能啟用自動摘要。')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: '我了解上述資料使用方式，並選擇啟用自動摘要' }))

    expect(next).toBeEnabled()
    expect(screen.queryByText('請先確認上述資料使用方式，才能啟用自動摘要。')).not.toBeInTheDocument()

    fireEvent.click(next)
    expect(useSummaryPrefsStore.getState().autoGenerate).toBe(true)
    expect(useSafetyPrefsStore.getState().autoScan).toBe(true)
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
  })
})
