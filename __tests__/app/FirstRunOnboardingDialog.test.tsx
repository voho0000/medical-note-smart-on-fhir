import { fireEvent, render, screen } from '@testing-library/react'
import { FirstRunOnboardingDialog } from '@/app/_components/FirstRunOnboardingDialog'
import { useSafetyPrefsStore } from '@/src/application/stores/safety-prefs.store'
import { useSummaryPrefsStore } from '@/src/application/stores/medical-summary-prefs.store'
import { DEMO_FLAG_KEY } from '@/src/infrastructure/fhir/services/local-bundle.service'
import {
  MEDCLOUD_AUTO_LAUNCH_URL,
  VGTPE_MEDCLOUD_LAUNCH_URL,
  VGTPE_SITE_LAUNCH_URL,
} from '@/src/application/launch/medcloud-launch-context'

const mockOnboarding = {
  step: '步驟',
  back: '上一步',
  start: '開始',
  welcomeTitle: '歡迎使用 MediPrisma',
  welcomeBody: '介紹',
  privacyTitle: '隱私與使用提醒',
  privacyPoints: ['提醒'],
}

let mockOnboardingCompleted = false
const mockMarkComplete = jest.fn()
const mockSetAudience = jest.fn()

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
  useAudience: () => ({ setAudience: mockSetAudience }),
}))

jest.mock('@/src/application/providers/auth.provider', () => ({
  useAuth: () => ({ user: null }),
}))

jest.mock('@/features/auth/components/AuthDialog', () => ({
  AuthDialog: () => null,
}))

jest.mock('@/src/application/hooks/patient/use-patient-query.hook', () => ({
  usePatient: () => ({ patient: { id: 'patient-1' }, loading: false, error: null }),
}))

jest.mock('@/src/application/hooks/onboarding/use-onboarding.hook', () => ({
  useOnboarding: () => ({
    ready: true,
    completed: mockOnboardingCompleted,
    markComplete: mockMarkComplete,
  }),
}))

// Automatic AI generation is off by default and is turned on only from the
// 醫療摘要 header switch — onboarding must never ask about it, and must never
// write either auto-run preference.
describe('FirstRunOnboardingDialog', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    mockMarkComplete.mockClear()
    mockSetAudience.mockClear()
    mockOnboardingCompleted = false
    useSafetyPrefsStore.setState({ autoScan: false })
    useSummaryPrefsStore.setState({ autoGenerate: false })
  })

  // The sign-in step is hidden behind SHOW_SIGN_IN_STEP, so audience is last.
  it('is welcome → audience only, with no auto-generation or sign-in question', () => {
    render(<FirstRunOnboardingDialog />)

    expect(screen.getByText('歡迎使用 MediPrisma')).toBeInTheDocument()
    expect(screen.getByText('步驟 1 / 2')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '開始' }))
    expect(screen.getByText('請問您的使用身份是？')).toBeInTheDocument()
    expect(screen.getByText('步驟 2 / 2')).toBeInTheDocument()

    // Picking an audience is the last step — it completes onboarding outright.
    fireEvent.click(screen.getByRole('button', { name: /我是醫療人員/ }))
    expect(mockSetAudience).toHaveBeenCalledWith('medical')
    expect(mockMarkComplete).toHaveBeenCalled()
    expect(screen.queryByText('登入或以訪客身分繼續')).not.toBeInTheDocument()
    expect(useSummaryPrefsStore.getState().autoGenerate).toBe(false)
    expect(useSafetyPrefsStore.getState().autoScan).toBe(false)
  })

  it('never reopens once onboarding is complete, including for a local import', () => {
    mockOnboardingCompleted = true
    // LocalBundleService uses this marker for synchronous source detection.
    localStorage.setItem('fhir_bundle_override', '1')

    render(<FirstRunOnboardingDialog />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('never reopens for demo data either', () => {
    mockOnboardingCompleted = true
    localStorage.setItem('fhir_bundle_override', '1')
    localStorage.setItem(DEMO_FLAG_KEY, '1')

    render(<FirstRunOnboardingDialog />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('stays out of the way on auto launches with or without a VGH site', () => {
    const { rerender } = render(
      <FirstRunOnboardingDialog launchHref={MEDCLOUD_AUTO_LAUNCH_URL} />,
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    rerender(<FirstRunOnboardingDialog launchHref={VGTPE_MEDCLOUD_LAUNCH_URL} />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    rerender(
      <FirstRunOnboardingDialog launchHref="https://mediprisma.tw/app/?site=vghtpe&medcloud2=auto" />,
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps the normal onboarding flow for a site-only launch', () => {
    render(<FirstRunOnboardingDialog launchHref={VGTPE_SITE_LAUNCH_URL} />)

    expect(screen.getByText('歡迎使用 MediPrisma')).toBeInTheDocument()
  })
})
