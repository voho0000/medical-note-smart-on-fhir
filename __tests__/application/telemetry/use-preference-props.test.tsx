// The three preference user properties. Each must be re-sent when the user
// changes it mid-session — a property that only reflects the value at sign-in
// would silently mis-attribute every later event.
jest.mock('@/src/application/telemetry/usage-analytics', () => {
  const actual = jest.requireActual('@/src/application/telemetry/usage-analytics')
  return { ...actual, setUserProps: jest.fn() }
})

jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({ locale: mockLocale }),
}))

jest.mock('@/src/application/stores/ai-config.store', () => ({
  useApiKey: () => mockKeys.openai,
  useGeminiKey: () => mockKeys.gemini,
  useClaudeKey: () => mockKeys.claude,
}))

import { act, render } from '@testing-library/react'
import { setUserProps } from '@/src/application/telemetry/usage-analytics'
import { useSummaryPrefsStore } from '@/src/application/stores/medical-summary-prefs.store'
import { usePreferenceProps } from '@/src/application/telemetry/use-preference-props'

let mockLocale = 'zh-TW'
const mockKeys = { openai: '', gemini: '', claude: '' }

const mockedSetUserProps = setUserProps as jest.MockedFunction<typeof setUserProps>

function Host() {
  usePreferenceProps()
  return null
}

/** All properties set during this render pass, merged. */
function reported(): Record<string, unknown> {
  return Object.assign({}, ...mockedSetUserProps.mock.calls.map((call) => call[0]))
}

describe('usePreferenceProps', () => {
  beforeEach(() => {
    mockedSetUserProps.mockClear()
    mockLocale = 'zh-TW'
    mockKeys.openai = ''
    mockKeys.gemini = ''
    mockKeys.claude = ''
    act(() => {
      useSummaryPrefsStore.setState({ autoGenerate: false })
    })
  })

  it('reports all three on mount', () => {
    render(<Host />)
    expect(reported()).toEqual({
      auto_summary: 'off',
      locale: 'zh-TW',
      key_mode: 'proxy',
    })
  })

  it('re-reports auto_summary when the switch is flipped', () => {
    render(<Host />)
    mockedSetUserProps.mockClear()

    act(() => {
      useSummaryPrefsStore.getState().setAutoGenerate(true)
    })

    expect(mockedSetUserProps).toHaveBeenCalledTimes(1)
    expect(mockedSetUserProps).toHaveBeenCalledWith({ auto_summary: 'on' })
  })

  it('reports "own" as soon as any provider key is present', () => {
    mockKeys.gemini = 'AIza-test-key'
    render(<Host />)
    expect(reported()).toMatchObject({ key_mode: 'own' })
  })

  it('follows the UI language', () => {
    mockLocale = 'en'
    render(<Host />)
    expect(reported()).toMatchObject({ locale: 'en' })
  })
})
