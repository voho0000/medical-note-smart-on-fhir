import { act, render, screen } from '@testing-library/react'
import { ContextTokenMeter } from '@/features/data-selection/components/ContextTokenMeter'
import type { ContextOverflowIssue } from '@/src/shared/utils/context-budget'

const getClinicalContext = jest.fn(() => [{ title: '病歷', items: ['內容'] }])
const formatClinicalContext = jest.fn(() => '病'.repeat(3_000))

jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({
    t: {
      dataSelection: {
        tokenMeterLabel: '已選病歷內容',
        tokenMeterModel: '模型',
        tokenMeterTop: '最大宗',
        tokenMeterRequestHint: '完整輸入會另行檢查。',
        tokenMeterOverflowGuidance: '上次完整摘要輸入約 {request} tokens，超過可用的 {usable} tokens。',
        tokenMeterReductionTarget: '至少需減少約 {reduction} tokens；建議將已選病歷降至 {target} tokens 以下。',
        tokenMeterTargetReached: '目前已低於建議值；關閉後可重新產生。',
        tokenMeterOver: '病歷本身過長。',
      },
    },
  }),
}))
jest.mock('@/src/application/hooks/use-clinical-context.hook', () => ({
  useClinicalContext: () => ({ getClinicalContext, formatClinicalContext }),
}))
jest.mock('@/src/application/stores/ai-config.store', () => ({
  useAllApiKeys: () => ({
    apiKey: 'user-key',
    geminiKey: '',
    claudeKey: '',
    openAiCompatible: null,
  }),
}))
jest.mock('@/src/application/stores/model-prefs.store', () => ({
  useEffectiveModel: () => 'gpt-5.4-nano',
}))

describe('ContextTokenMeter overflow guidance', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.clearAllMocks()
  })

  afterEach(() => jest.useRealTimers())

  it('shows the complete-request reduction target inside Data Selection', () => {
    const overflowIssue: ContextOverflowIssue = {
      kind: 'context-overflow',
      requestTokens: 15_000,
      selectedTokens: 6_400,
      usable: 11_000,
      limit: 15_000,
      reserve: 4_000,
      overBy: 4_000,
      suggestedSelectedMax: 2_400,
    }

    render(
      <ContextTokenMeter
        modelId="gpt-5.4-nano"
        fallbackModelId="gpt-5.4-nano"
        overflowIssue={overflowIssue}
      />,
    )
    act(() => jest.advanceTimersByTime(400))

    const guidance = screen.getByRole('status')
    expect(guidance).toHaveTextContent('完整摘要輸入約 15k tokens')
    expect(guidance).toHaveTextContent('至少需減少約 4k tokens')
    expect(guidance).toHaveTextContent('降至 2.4k tokens 以下')
    expect(guidance).toHaveTextContent('目前已低於建議值')
  })
})
