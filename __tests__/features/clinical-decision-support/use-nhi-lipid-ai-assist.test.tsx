import { act, renderHook } from '@testing-library/react'
import { useNhiLipidAiAssist } from '@/features/clinical-decision-support/hooks/use-nhi-lipid-ai-assist.hook'
import { useNhiLipidReviewStore } from '@/features/clinical-decision-support/stores/nhi-lipid-review.store'
import { useClinicalAiInput } from '@/src/application/hooks/ai-generation/use-clinical-ai-input.hook'
import { useUnifiedAi } from '@/src/application/hooks/ai/use-unified-ai.hook'

jest.mock('@/src/application/hooks/ai-generation/use-clinical-ai-input.hook', () => ({
  useClinicalAiInput: jest.fn(),
}))
jest.mock('@/src/application/hooks/ai/use-unified-ai.hook', () => ({ useUnifiedAi: jest.fn() }))
jest.mock('@/src/application/stores/ai-config.store', () => ({
  useAllApiKeys: () => ({ openAiCompatibleProfiles: [] }),
}))
jest.mock('@/src/application/stores/model-prefs.store', () => ({
  MODEL_PREF_DEFAULTS: { insights: 'model-fallback' },
  useEffectiveModel: () => 'model-test',
  useModelPref: () => 'model-selected',
  useSetModelFor: () => jest.fn(),
}))
jest.mock('@/src/shared/utils/model-access.utils', () => ({
  modelContextLimit: () => 128_000,
  modelDisplayLabel: (modelId: string) => modelId === 'model-actual' ? 'Actual Model' : 'Model Test',
}))
jest.mock('@/src/shared/utils/openai-compatible.utils', () => ({
  resolveOpenAiCompatibleProfile: () => undefined,
}))
jest.mock('@/src/core/errors', () => ({ getUserErrorMessage: () => 'AI failed' }))

const mockedInput = jest.mocked(useClinicalAiInput)
const mockedAi = jest.mocked(useUnifiedAi)
const criteria = [{
  id: 'smoking',
  label: '抽菸',
  value: '未確認',
  state: 'unknown' as const,
  origin: 'record' as const,
  editable: true,
}]

function clinicalInput(inputSignature = 'input-1', sourceScopeSignature = 'scope-1') {
  return {
    patientId: 'synthetic-hook',
    dataReady: true,
    clinicalContext: '<BEGIN_DOCUMENT id="doc-smoking">目前每日抽菸一包。<END_DOCUMENT id="doc-smoking">',
    inputSignature,
    sourceScopeSignature,
    catalog: [{
      key: 'D1',
      resourceType: 'DocumentReference',
      resourceId: 'doc-smoking',
      display: '出院病歷摘要',
      getContentText: () => '目前每日抽菸一包。',
    }],
  } as ReturnType<typeof useClinicalAiInput>
}

const yesReply = JSON.stringify({ suggestions: [{
  criterionId: 'smoking',
  state: 'yes',
  confidence: 'high',
  evidence: [{ source: 'D1', excerpt: '目前每日抽菸一包。' }],
}] })

describe('useNhiLipidAiAssist request lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    useNhiLipidReviewStore.getState().activate(undefined)
    mockedInput.mockReturnValue(clinicalInput())
  })

  it('uses a Table 1-specific data scope', () => {
    mockedAi.mockReturnValue({ query: jest.fn(), stop: jest.fn() } as unknown as ReturnType<typeof useUnifiedAi>)
    renderHook(() => useNhiLipidAiAssist({
      patientId: 'synthetic-hook',
      criteria,
      locale: 'zh-TW',
    }))

    expect(mockedInput).toHaveBeenCalledWith(128_000, 'nhiLipid', 0.62)
  })

  it('rejects a late response after the same patient input revision changes', async () => {
    let resolveReply!: (value: string) => void
    const query = jest.fn(() => new Promise<string>((resolve) => { resolveReply = resolve }))
    mockedAi.mockReturnValue({ query, stop: jest.fn() } as unknown as ReturnType<typeof useUnifiedAi>)
    useNhiLipidReviewStore.getState().activate('synthetic-hook')
    const hook = renderHook(() => useNhiLipidAiAssist({
      patientId: 'synthetic-hook',
      criteria,
      locale: 'zh-TW',
    }))

    let pending!: Promise<void>
    act(() => { pending = hook.result.current.run() })
    mockedInput.mockReturnValue(clinicalInput('input-2', 'scope-2'))
    hook.rerender()
    await act(async () => {
      resolveReply(yesReply)
      await pending
    })

    expect(useNhiLipidReviewStore.getState().answers).toEqual({})
    expect(hook.result.current.suggestions).toEqual({})
    expect(hook.result.current.isRunning).toBe(false)
    expect(hook.result.current.error).toContain('病歷資料已更新')
  })

  it('preserves a clinician answer entered while AI is running', async () => {
    let resolveReply!: (value: string) => void
    mockedAi.mockReturnValue({
      query: jest.fn(() => new Promise<string>((resolve) => { resolveReply = resolve })),
      stop: jest.fn(),
    } as unknown as ReturnType<typeof useUnifiedAi>)
    useNhiLipidReviewStore.getState().activate('synthetic-hook')
    const hook = renderHook(() => useNhiLipidAiAssist({
      patientId: 'synthetic-hook',
      criteria,
      locale: 'zh-TW',
    }))

    let pending!: Promise<void>
    act(() => { pending = hook.result.current.run() })
    act(() => {
      useNhiLipidReviewStore.getState().answer(
        'synthetic-hook',
        'smoking',
        'no',
        { source: 'manual' },
      )
    })
    await act(async () => {
      resolveReply(yesReply)
      await pending
    })

    expect(useNhiLipidReviewStore.getState().answers.smoking).toBe('no')
    expect(useNhiLipidReviewStore.getState().provenance.smoking).toEqual({ source: 'manual' })
    expect(hook.result.current.suggestions.smoking.state).toBe('yes')
  })

  it('keeps the complete evidence session across panel unmount and remount', async () => {
    mockedAi.mockReturnValue({
      query: jest.fn(async () => yesReply),
      stop: jest.fn(),
    } as unknown as ReturnType<typeof useUnifiedAi>)
    useNhiLipidReviewStore.getState().activate('synthetic-hook')
    const first = renderHook(() => useNhiLipidAiAssist({
      patientId: 'synthetic-hook',
      criteria,
      locale: 'zh-TW',
    }))
    await act(async () => { await first.result.current.run() })
    expect(first.result.current.suggestions.smoking.evidence[0].sourceResourceId).toBe('doc-smoking')
    first.unmount()

    const second = renderHook(() => useNhiLipidAiAssist({
      patientId: 'synthetic-hook',
      criteria,
      locale: 'zh-TW',
    }))
    expect(second.result.current.suggestions.smoking.evidence[0].excerpt).toBe('目前每日抽菸一包。')
    expect(second.result.current.lastCompleted?.inputSignature).toBe('input-1')
  })

  it('records the routed model while running and the provider-reported model on completion', async () => {
    let resolveReply!: (value: string) => void
    const query = jest.fn((
      _messages: unknown,
      options?: { onModelExecution?: (execution: {
        requestedModelId: string
        routedModelId: string
        actualModelId: string | null
        actualModelIds: string[]
      }) => void },
    ) => new Promise<string>((resolve) => {
      resolveReply = (value) => {
        options?.onModelExecution?.({
          requestedModelId: 'model-selected',
          routedModelId: 'model-test',
          actualModelId: 'model-actual',
          actualModelIds: ['model-actual'],
        })
        resolve(value)
      }
    }))
    mockedAi.mockReturnValue({ query, stop: jest.fn() } as unknown as ReturnType<typeof useUnifiedAi>)
    useNhiLipidReviewStore.getState().activate('synthetic-hook')
    const hook = renderHook(() => useNhiLipidAiAssist({
      patientId: 'synthetic-hook',
      criteria,
      locale: 'zh-TW',
    }))

    let pending!: Promise<void>
    act(() => { pending = hook.result.current.run() })
    expect(hook.result.current.latestAttempt).toMatchObject({
      modelId: 'model-test',
      modelName: 'Model Test',
    })

    await act(async () => {
      resolveReply(yesReply)
      await pending
    })

    expect(query).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      modelId: 'model-test',
      requestedModelId: 'model-selected',
    }))
    expect(hook.result.current.lastCompleted).toMatchObject({
      modelId: 'model-actual',
      modelName: 'Actual Model',
    })
    expect(hook.result.current.suggestions.smoking).toMatchObject({
      modelId: 'model-actual',
      modelName: 'Actual Model',
    })
  })

  it('settles the latest run when the provider aborts it', async () => {
    const aborted = new Error('cancelled')
    aborted.name = 'AbortError'
    mockedAi.mockReturnValue({
      query: jest.fn(async () => { throw aborted }),
      stop: jest.fn(),
    } as unknown as ReturnType<typeof useUnifiedAi>)
    useNhiLipidReviewStore.getState().activate('synthetic-hook')
    const hook = renderHook(() => useNhiLipidAiAssist({
      patientId: 'synthetic-hook',
      criteria,
      locale: 'zh-TW',
    }))

    await act(async () => { await hook.result.current.run() })

    expect(hook.result.current.isRunning).toBe(false)
    expect(hook.result.current.error).toBeNull()
  })
})
