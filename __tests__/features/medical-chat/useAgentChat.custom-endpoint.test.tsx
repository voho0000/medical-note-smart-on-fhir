import { StrictMode, type ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useAgentChat } from '@/features/medical-chat/hooks/useAgentChat'
import { useAiConfigStore } from '@/src/application/stores/ai-config.store'
import { CUSTOM_OPENAI_MODEL_ID } from '@/src/shared/constants/ai-models.constants'
import type { OpenAiCompatibleProfile } from '@/src/shared/types/openai-compatible.types'

const mockStandardChatStream = jest.fn()
const mockRunDeepModeAgent = jest.fn()
const mockFhirTools = jest.fn()
const mockSetChatMessages = jest.fn()
const mockGetFullClinicalContext = jest.fn(() => 'selected clinical context')
const mockBuildAgentSystemPrompt = jest.fn((..._args: unknown[]) => 'agent system prompt')
let mockChatMessages: Array<{
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}> = []

jest.mock('@/src/infrastructure/ai/streaming/ai-sdk-stream.adapter', () => ({
  AiSdkStreamAdapter: jest.fn().mockImplementation(() => ({
    stream: (...args: unknown[]) => mockStandardChatStream(...args),
  })),
}))
jest.mock('@/src/application/stores/chat.store', () => ({
  useChatMessages: () => mockChatMessages,
  useSetChatMessages: () => mockSetChatMessages,
}))
jest.mock('@/src/application/hooks/patient/use-patient-query.hook', () => ({
  usePatient: () => ({ patient: null }),
}))
jest.mock('@/src/application/hooks/ai-generation/use-clinical-ai-input.hook', () => ({
  useClinicalAiInput: () => ({
    clinicalContext: mockGetFullClinicalContext(),
    dataReady: true,
    contextAdaptation: null,
  }),
}))
jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({
    t: {
      agent: {
        thinking: 'thinking',
        apiKeyRequired: 'API key required',
      },
      settings: {
        openAiCompatibleNotConfigured: 'Custom endpoint not configured',
      },
      medicalChat: {
        localStandardContextTooLarge: 'Context too large',
      },
    },
  }),
}))
jest.mock('@/src/application/hooks/ai/use-fhir-tools.hook', () => ({
  useFhirTools: () => mockFhirTools(),
}))
jest.mock('@/src/application/hooks/ai/use-literature-tools.hook', () => ({
  useLiteratureTools: () => undefined,
}))
jest.mock('@/src/infrastructure/fhir/client/fhir-client.service', () => ({
  shouldUseLocalBundle: () => false,
}))
jest.mock('@/src/application/providers/auth.provider', () => ({
  useAuth: () => ({ user: null, isAnonymous: false }),
}))
jest.mock('@/src/core/use-cases/chat/build-standard-chat-system-prompt.use-case', () => ({
  buildStandardChatSystemPrompt: () => 'local system prompt',
}))
jest.mock('@/src/core/use-cases/agent/build-agent-system-prompt.use-case', () => ({
  buildAgentSystemPromptUseCase: {
    execute: (...args: unknown[]) => mockBuildAgentSystemPrompt(...args),
  },
}))
jest.mock('@/src/shared/utils/context-window-manager', () => ({
  truncateToContextWindow: (messages: unknown[]) => messages,
}))
jest.mock('@/src/infrastructure/ai/agent/run-deep-mode-agent', () => ({
  runDeepModeAgent: (...args: unknown[]) => mockRunDeepModeAgent(...args),
}))

const profile: OpenAiCompatibleProfile = {
  profileId: 'legacy',
  enabled: true,
  baseUrl: 'https://hospital.example/v1',
  modelId: 'hospital-7b',
  apiKey: 'local-key',
  transport: 'direct',
  contextWindowTokens: 32768,
  contextWindowSource: 'manual',
}

function setProfiles(openAiCompatibleProfiles: OpenAiCompatibleProfile[]) {
  useAiConfigStore.setState({ openAiCompatibleProfiles })
}

describe('useAgentChat custom endpoint lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockChatMessages = []
    mockFhirTools.mockReturnValue(undefined)
    mockRunDeepModeAgent.mockResolvedValue({
      answer: '',
      toolCalls: [],
      citations: [],
      trajectory: [],
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    })
    useAiConfigStore.setState({
      apiKey: null,
      geminiKey: null,
      claudeKey: null,
      perplexityKey: null,
      openAiCompatibleProfiles: [profile],
    })
  })

  it('re-resolves a captured send callback and never streams after profile deletion', async () => {
    const { result } = renderHook(() => useAgentChat('system', CUSTOM_OPENAI_MODEL_ID))
    const capturedSend = result.current.handleSend

    act(() => setProfiles([]))
    await act(async () => capturedSend('clinical question'))

    expect(mockStandardChatStream).not.toHaveBeenCalled()
  })

  it('aborts an active local chat when its exact profile is replaced', async () => {
    let finishStream!: () => void
    let signal!: AbortSignal
    mockStandardChatStream.mockImplementationOnce(async (options: { signal: AbortSignal }) => {
      signal = options.signal
      await new Promise<void>((resolve) => { finishStream = resolve })
    })
    const { result } = renderHook(() => useAgentChat('system', CUSTOM_OPENAI_MODEL_ID))

    let sending!: Promise<void>
    act(() => {
      sending = result.current.handleSend('clinical question')
    })
    await waitFor(() => expect(mockStandardChatStream).toHaveBeenCalledTimes(1))

    act(() => setProfiles([{ ...profile, enabled: false }]))
    expect(signal.aborted).toBe(true)

    await act(async () => {
      finishStream()
      await sending
    })
  })

  it('aborts the local stream on unmount', async () => {
    let finishStream!: () => void
    let signal!: AbortSignal
    mockStandardChatStream.mockImplementationOnce(async (options: { signal: AbortSignal }) => {
      signal = options.signal
      await new Promise<void>((resolve) => { finishStream = resolve })
    })
    const { result, unmount } = renderHook(() => (
      useAgentChat('system', CUSTOM_OPENAI_MODEL_ID)
    ))

    let sending!: Promise<void>
    act(() => {
      sending = result.current.handleSend('clinical question')
    })
    await waitFor(() => expect(mockStandardChatStream).toHaveBeenCalledTimes(1))

    unmount()
    expect(signal.aborted).toBe(true)
    await act(async () => {
      finishStream()
      await sending
    })
  })

  it('remains usable after the StrictMode effect rehearsal', async () => {
    mockStandardChatStream.mockResolvedValueOnce(undefined)
    const wrapper = ({ children }: { children: ReactNode }) => (
      <StrictMode>{children}</StrictMode>
    )
    const { result } = renderHook(
      () => useAgentChat('system', CUSTOM_OPENAI_MODEL_ID),
      { wrapper },
    )

    await act(async () => result.current.handleSend('請查這位病人的臨床資料'))

    expect(mockStandardChatStream).toHaveBeenCalledTimes(1)
  })

  it('runs the deep Agent for an auto-mode custom profile with verified tools', async () => {
    const fhirTool = { description: 'FHIR test tool' }
    mockFhirTools.mockReturnValue({ getPatientData: fhirTool })
    setProfiles([{
      ...profile,
      agentMode: 'auto',
      agentCapability: 'verified',
      agentCapabilityTestedAt: 1_721_234_567_890,
    }])
    const { result } = renderHook(() => useAgentChat('system', CUSTOM_OPENAI_MODEL_ID))

    await act(async () => result.current.handleSend('請查這位病人的臨床資料'))

    expect(mockStandardChatStream).not.toHaveBeenCalled()
    expect(mockRunDeepModeAgent).toHaveBeenCalledWith(expect.objectContaining({
      tools: { getPatientData: fhirTool },
      idleMs: 10 * 60_000,
    }))
  })

  it('prefetches the compact health snapshot for a broad local summary', async () => {
    const snapshotTool = { description: 'Compact health summary tool' }
    mockFhirTools.mockReturnValue({ getHealthSummarySnapshot: snapshotTool })
    setProfiles([{
      ...profile,
      agentMode: 'auto',
      agentCapability: 'verified',
      agentCapabilityTestedAt: 1_721_234_567_890,
    }])
    const { result } = renderHook(() => useAgentChat('system', CUSTOM_OPENAI_MODEL_ID))

    await act(async () => result.current.handleSend(
      '請用我匯入的健康資料整理身體狀況、慢性疾病、目前用藥與檢驗正常範圍。',
    ))

    expect(mockRunDeepModeAgent).toHaveBeenCalledWith(expect.objectContaining({
      tools: { getHealthSummarySnapshot: snapshotTool },
      initialToolName: 'getHealthSummarySnapshot',
      preExecuteInitialTool: true,
    }))
  })

  it('withholds every FHIR tool for an unpersonalized guideline update question', async () => {
    const snapshotTool = { description: 'Compact health summary tool' }
    const medicationTool = { description: 'Medication tool' }
    mockFhirTools.mockReturnValue({
      getHealthSummarySnapshot: snapshotTool,
      getActiveMedicationList: medicationTool,
    })
    mockChatMessages = [
      {
        id: 'prior-user',
        role: 'user',
        content: '請整理我的病歷',
        timestamp: 1,
      },
      {
        id: 'prior-assistant',
        role: 'assistant',
        content: 'PRIOR_PATIENT_SUMMARY_SHOULD_NOT_BE_SENT',
        timestamp: 2,
      },
    ]
    setProfiles([{
      ...profile,
      agentMode: 'auto',
      agentCapability: 'verified',
      agentCapabilityTestedAt: 1_721_234_567_890,
    }])
    const { result } = renderHook(() => useAgentChat('system', CUSTOM_OPENAI_MODEL_ID))

    await act(async () => result.current.handleSend(
      '目前糖尿病用藥 guideline 有什麼更新？',
    ))

    expect(mockRunDeepModeAgent).toHaveBeenCalledWith(expect.objectContaining({
      tools: {},
      initialToolName: undefined,
      preExecuteInitialTool: false,
    }))
    const runInput = mockRunDeepModeAgent.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>
    }
    expect(runInput.messages).toHaveLength(2)
    expect(runInput.messages.map((message) => message.content).join('\n'))
      .not.toContain('PRIOR_PATIENT_SUMMARY_SHOULD_NOT_BE_SENT')
    expect(runInput.messages[1].content).toContain('糖尿病用藥 guideline')
    expect(mockBuildAgentSystemPrompt).toHaveBeenCalledWith(expect.objectContaining({
      availableToolNames: [],
      turnDataScope: 'general-no-patient',
      currentEvidenceUnavailable: true,
    }))
  })

  it('allows the snapshot for an explicitly personalized guideline question', async () => {
    const snapshotTool = { description: 'Compact health summary tool' }
    mockFhirTools.mockReturnValue({ getHealthSummarySnapshot: snapshotTool })
    setProfiles([{
      ...profile,
      agentMode: 'auto',
      agentCapability: 'verified',
      agentCapabilityTestedAt: 1_721_234_567_890,
    }])
    const { result } = renderHook(() => useAgentChat('system', CUSTOM_OPENAI_MODEL_ID))

    await act(async () => result.current.handleSend(
      '請根據我的病歷，說明最新糖尿病 guideline 對我有什麼影響。',
    ))

    expect(mockRunDeepModeAgent).toHaveBeenCalledWith(expect.objectContaining({
      tools: { getHealthSummarySnapshot: snapshotTool },
      initialToolName: 'getHealthSummarySnapshot',
      preExecuteInitialTool: true,
    }))
    expect(mockBuildAgentSystemPrompt).toHaveBeenCalledWith(expect.objectContaining({
      turnDataScope: undefined,
      currentEvidenceUnavailable: true,
    }))
  })

  it('keeps auto-mode custom profiles on standard chat when the probe is not verified', async () => {
    setProfiles([{
      ...profile,
      agentMode: 'auto',
      agentCapability: 'unsupported',
      agentCapabilityTestedAt: 1_721_234_567_890,
    }])
    mockStandardChatStream.mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useAgentChat('system', CUSTOM_OPENAI_MODEL_ID))

    await act(async () => result.current.handleSend('clinical question'))

    expect(mockStandardChatStream).toHaveBeenCalledTimes(1)
    expect(mockRunDeepModeAgent).not.toHaveBeenCalled()
  })

  it('fails closed for a legacy manual-deep value without a verified probe', async () => {
    setProfiles([{
      ...profile,
      agentMode: 'deep-agent' as never,
      agentCapability: 'unknown',
      agentCapabilityTestedAt: null,
    }])
    mockStandardChatStream.mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useAgentChat('system', CUSTOM_OPENAI_MODEL_ID))

    await act(async () => result.current.handleSend('clinical question'))

    expect(mockStandardChatStream).toHaveBeenCalledTimes(1)
    expect(mockRunDeepModeAgent).not.toHaveBeenCalled()
  })
})
