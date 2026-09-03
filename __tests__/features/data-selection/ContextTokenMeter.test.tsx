import { act, render, screen } from '@testing-library/react'
import { ContextTokenMeter } from '@/features/data-selection/components/ContextTokenMeter'
import type { ContextOverflowIssue } from '@/src/shared/utils/context-budget'
import type { OpenAiCompatibleProfile } from '@/src/shared/types/openai-compatible.types'
import { customOpenAiModelIdForProfile } from '@/src/shared/constants/ai-models.constants'

let mockProfiles: OpenAiCompatibleProfile[] = []

const getClinicalContext = jest.fn(() => [{ title: '病歷', items: ['內容'] }])
const formatClinicalContext = jest.fn(() => '病'.repeat(3_000))
let fittedClinicalInput = {
  dataReady: true,
  clinicalContext: '病'.repeat(3_000),
  inputSignature: 'scope-1',
  contextAdaptation: null as null | {
    tier: 'compact' | 'prioritized'
    contextLimit: number
    targetTokens: number
    originalTokens: number
    adaptedTokens: number
  },
}

jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({
    locale: 'zh-TW',
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
      ipsExport: {
        aiHandoff: {
          externalTokenLabel: '本次匯出內容',
          externalDistributionLabel: '內容比例',
          externalTokenHint: '目的地限制不同，請縮小資料範圍。',
        },
      },
    },
  }),
}))
jest.mock('@/src/application/hooks/ai-generation/use-clinical-ai-input.hook', () => ({
  useClinicalAiInput: () => fittedClinicalInput,
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
    openAiCompatibleProfiles: mockProfiles,
  }),
}))
jest.mock('@/src/application/stores/model-prefs.store', () => ({
  useEffectiveModel: () => 'gpt-5.4-nano',
}))

describe('ContextTokenMeter overflow guidance', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.clearAllMocks()
    mockProfiles = []
    fittedClinicalInput = {
      dataReady: true,
      clinicalContext: '病'.repeat(3_000),
      inputSignature: 'scope-1',
      contextAdaptation: null,
    }
  })

  afterEach(() => jest.useRealTimers())

  it('warns immediately when intact manual documents still exceed the VGH patient cap', () => {
    mockProfiles = [{
      profileId: 'vgh-test', enabled: true, baseUrl: 'https://hospital.example/v1',
      modelId: 'tvghbrain3.5', apiKey: null, contextWindowTokens: 262_144,
    }]
    Object.assign(fittedClinicalInput, {
      clinicalContext: 'a'.repeat(110_000 * 4), preserveManualDocuments: true,
      contextAdaptation: {
        tier: 'prioritized', contextLimit: 154_000, targetTokens: 100_000,
        originalTokens: 150_000, adaptedTokens: 110_000, protectedDocumentCount: 3,
      },
    })
    render(<ContextTokenMeter modelId={customOpenAiModelIdForProfile('vgh-test')} />)
    act(() => jest.advanceTimersByTime(400))
    expect(screen.getByRole('alert')).toHaveTextContent('自選文件已完整保留，但病歷仍超過容量')
    expect(screen.getByRole('alert')).toHaveTextContent('不會自動截短文件')
    expect(screen.getByTestId('model-fitted-scope')).toHaveTextContent('完整保留 3 份自選文件')
    expect(screen.getByTestId('model-fitted-scope')).not.toHaveTextContent('最近一次出院病摘')
  })

  it('distinguishes the VGH patient cap from the complete input cap', () => {
    mockProfiles = [{
      profileId: 'vgh-test', enabled: true, baseUrl: 'https://hospital.example/v1',
      modelId: 'tvghbrain3.5', apiKey: null, contextWindowTokens: 262_144,
    }]
    render(<ContextTokenMeter
      modelId={customOpenAiModelIdForProfile('vgh-test')}
      overflowIssue={{
        kind: 'context-overflow', requestTokens: 120_000, selectedTokens: 110_000,
        selectedLimit: 100_000, usable: 150_000, limit: 154_000, reserve: 4_000,
        overBy: 10_000, suggestedSelectedMax: 100_000,
      }}
    />)
    act(() => jest.advanceTimersByTime(400))

    expect(screen.getByText(/病人 context 上限 100k tokens/)).toHaveTextContent('完整輸入上限 150k tokens')
    expect(screen.getByText(/病人 context 上限 100k tokens/)).toHaveTextContent('不截短文字')
    expect(screen.getByRole('status')).toHaveTextContent('病人 context 約 110k tokens，超過 100k tokens 上限')
    expect(screen.getByRole('status')).not.toHaveTextContent('超過可用的 150k')
  })

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

  it('shows the model-fitted scope and token reduction without replacing the saved scope', () => {
    fittedClinicalInput = {
      dataReady: true,
      clinicalContext: '病'.repeat(900),
      inputSignature: 'scope-1',
      contextAdaptation: {
        tier: 'prioritized',
        contextLimit: 32_768,
        targetTokens: 15_822,
        originalTokens: 20_000,
        adaptedTokens: 600,
      },
    }

    render(<ContextTokenMeter modelId="gpt-5.4-nano" />)
    act(() => jest.advanceTimersByTime(400))

    expect(screen.getByText('本次實際送出內容')).toBeInTheDocument()
    const fittedScope = screen.getByTestId('model-fitted-scope')
    expect(fittedScope).toHaveTextContent('原始選擇約 2k tokens')
    expect(fittedScope).toHaveTextContent('本次實際送出約 600 tokens')
    expect(fittedScope).toHaveTextContent('逐筆保留活動中問題、過敏、目前用藥')
    expect(fittedScope).toHaveTextContent('來源索引已依實際保留內容重建')
    expect(fittedScope).toHaveTextContent('你儲存的資料範圍沒有變更')
    expect(fittedScope).toHaveTextContent('控制項維持原本資料範圍')
  })

  it('shows destination-neutral size guidance for external AI export', () => {
    render(<ContextTokenMeter consumer="aiExport" />)
    act(() => jest.advanceTimersByTime(400))

    expect(screen.getByText('本次匯出內容')).toBeInTheDocument()
    expect(screen.getByText(/~2(?:\.0)?k tokens/)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /內容比例.*病歷 100%/ })).toBeInTheDocument()
    expect(screen.getByText('目的地限制不同，請縮小資料範圍。')).toBeInTheDocument()
    expect(screen.queryByText(/模型:/)).not.toBeInTheDocument()
  })
})
