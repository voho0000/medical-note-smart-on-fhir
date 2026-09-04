import { render, screen } from '@testing-library/react'
import { HeaderAuthButton } from '@/features/auth/components/HeaderAuthButton'
import { useAuth } from '@/src/application/providers/auth.provider'

jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({
    t: {
      auth: {
        restoringSession: '正在恢復登入',
      },
    },
  }),
}))

jest.mock('@/src/application/providers/auth.provider', () => ({
  useAuth: jest.fn(),
}))

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>

describe('HeaderAuthButton', () => {
  it('shows a neutral restoring state instead of guest or sign-in actions', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isAnonymous: false,
      loading: true,
      signOut: jest.fn(),
      dailyUsage: 0,
      dailyLimit: 0,
      perplexityUsage: 0,
      whisperUsage: 0,
      perplexityLimit: 0,
      whisperLimit: 0,
    } as unknown as ReturnType<typeof useAuth>)

    render(<HeaderAuthButton />)

    const status = screen.getByRole('button', { name: '正在恢復登入' })
    expect(status).toBeDisabled()
    expect(screen.queryByText('訪客')).not.toBeInTheDocument()
  })
})
