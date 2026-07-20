import { StrictMode, type ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useVoiceRecording } from '@/features/medical-chat/hooks/useVoiceRecording'
import { useAiConfigStore } from '@/src/application/stores/ai-config.store'
import {
  CUSTOM_OPENAI_MODEL_ID,
  customOpenAiModelIdForProfile,
} from '@/src/shared/constants/ai-models.constants'
import type { OpenAiCompatibleProfile } from '@/src/shared/types/openai-compatible.types'

const mockSetIsAsrLoading = jest.fn()
const mockToastError = jest.fn()
const mockToastInfo = jest.fn()

jest.mock('@/src/application/providers/asr.provider', () => ({
  useAsr: () => ({
    isAsrLoading: false,
    setIsAsrLoading: mockSetIsAsrLoading,
  }),
}))
jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({
    t: {
      chat: {
        voiceNeedsApiKey: 'Voice endpoint unavailable',
        voiceNoSpeech: 'No speech',
      },
    },
  }),
}))
jest.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    info: (...args: unknown[]) => mockToastInfo(...args),
  },
}))

const profileA: OpenAiCompatibleProfile = {
  profileId: 'legacy',
  enabled: true,
  baseUrl: 'https://hospital-a.example/v1',
  modelId: 'hospital-a-7b',
  apiKey: 'local-a-key',
  transport: 'direct',
  contextWindowTokens: 32768,
  contextWindowSource: 'manual',
}
const profileB: OpenAiCompatibleProfile = {
  ...profileA,
  profileId: 'profile-b',
  baseUrl: 'https://hospital-b.example/v1',
  modelId: 'hospital-b-7b',
  apiKey: 'local-b-key',
}
const audioBlob = new Blob(['audio'], { type: 'audio/webm' })
const originalFetch = global.fetch
const mockFetch = jest.fn()

function setProfiles(openAiCompatibleProfiles: OpenAiCompatibleProfile[]) {
  useAiConfigStore.setState({ openAiCompatibleProfiles })
}

function successfulResponse(text = 'transcript') {
  return {
    ok: true,
    json: jest.fn(async () => ({ text })),
  }
}

function beginRecording(result: { current: ReturnType<typeof useVoiceRecording> }) {
  act(() => {
    result.current.toggleRecording()
    result.current.onRecordingStart()
  })
}

describe('useVoiceRecording custom endpoint lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = mockFetch as typeof fetch
    useAiConfigStore.setState({
      apiKey: 'cloud-key-that-must-not-be-used',
      openAiCompatibleProfiles: [profileA],
    })
  })

  afterAll(() => {
    global.fetch = originalFetch
  })

  it.each([
    ['missing', []],
    ['disabled', [{ ...profileA, enabled: false }]],
    ['gateway-only', [{ ...profileA, transport: 'mediprisma-gateway' as const }]],
  ])('never falls back to cloud audio for a %s custom profile', async (_name, profiles) => {
    setProfiles(profiles)
    const onTranscriptReady = jest.fn()
    const { result } = renderHook(() => (
      useVoiceRecording(onTranscriptReady, CUSTOM_OPENAI_MODEL_ID)
    ))

    act(() => result.current.toggleRecording())
    await act(async () => result.current.onRecordingStop('', audioBlob))

    expect(mockFetch).not.toHaveBeenCalled()
    expect(onTranscriptReady).not.toHaveBeenCalled()
    expect(mockToastError).toHaveBeenCalledWith('Voice endpoint unavailable')
  })

  it('discards audio when its exact profile changes between recording start and stop', async () => {
    const onTranscriptReady = jest.fn()
    const { result } = renderHook(() => (
      useVoiceRecording(onTranscriptReady, CUSTOM_OPENAI_MODEL_ID)
    ))
    beginRecording(result)

    act(() => setProfiles([{ ...profileA, apiKey: 'replacement-key' }]))
    await act(async () => result.current.onRecordingStop('', audioBlob))

    expect(mockFetch).not.toHaveBeenCalled()
    expect(onTranscriptReady).not.toHaveBeenCalled()
  })

  it('keeps a recording bound to model A when the picker switches to model B', async () => {
    setProfiles([profileA, profileB])
    mockFetch.mockResolvedValueOnce(successfulResponse('from A'))
    const onTranscriptReady = jest.fn()
    const { result, rerender } = renderHook(
      ({ modelId }: { modelId: string | null }) => (
        useVoiceRecording(onTranscriptReady, modelId)
      ),
      { initialProps: { modelId: CUSTOM_OPENAI_MODEL_ID as string | null } },
    )
    beginRecording(result)

    rerender({ modelId: customOpenAiModelIdForProfile(profileB.profileId) })
    await act(async () => result.current.onRecordingStop('', audioBlob))

    expect(mockFetch).toHaveBeenCalledWith(
      'https://hospital-a.example/v1/audio/transcriptions',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer local-a-key' }),
      }),
    )
    expect(onTranscriptReady).toHaveBeenCalledWith('from A')
  })

  it('aborts an active request and ignores a delayed success after profile replacement', async () => {
    let finishFetch!: (response: ReturnType<typeof successfulResponse>) => void
    let signal!: AbortSignal
    mockFetch.mockImplementationOnce(async (_url: string, init: RequestInit) => {
      signal = init.signal as AbortSignal
      return await new Promise<ReturnType<typeof successfulResponse>>((resolve) => {
        finishFetch = resolve
      })
    })
    const onTranscriptReady = jest.fn()
    const { result } = renderHook(() => (
      useVoiceRecording(onTranscriptReady, CUSTOM_OPENAI_MODEL_ID)
    ))
    beginRecording(result)

    let transcription!: Promise<void>
    act(() => {
      transcription = result.current.onRecordingStop('', audioBlob)
    })
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))

    act(() => setProfiles([{ ...profileA, baseUrl: 'https://replacement.example/v1' }]))
    expect(signal.aborted).toBe(true)
    await act(async () => {
      finishFetch(successfulResponse('must be ignored'))
      await transcription
    })

    expect(onTranscriptReady).not.toHaveBeenCalled()
  })

  it('does not abort model A when only an unrelated profile is edited', async () => {
    setProfiles([profileA, profileB])
    let finishFetch!: (response: ReturnType<typeof successfulResponse>) => void
    let signal!: AbortSignal
    mockFetch.mockImplementationOnce(async (_url: string, init: RequestInit) => {
      signal = init.signal as AbortSignal
      return await new Promise<ReturnType<typeof successfulResponse>>((resolve) => {
        finishFetch = resolve
      })
    })
    const onTranscriptReady = jest.fn()
    const { result } = renderHook(() => (
      useVoiceRecording(onTranscriptReady, CUSTOM_OPENAI_MODEL_ID)
    ))
    beginRecording(result)

    let transcription!: Promise<void>
    act(() => {
      transcription = result.current.onRecordingStop('', audioBlob)
    })
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))

    act(() => setProfiles([profileA, { ...profileB, modelId: 'updated-b' }]))
    expect(signal.aborted).toBe(false)
    await act(async () => {
      finishFetch(successfulResponse('from A'))
      await transcription
    })
    expect(onTranscriptReady).toHaveBeenCalledWith('from A')
  })

  it.each([
    ['custom', CUSTOM_OPENAI_MODEL_ID],
    ['cloud', null],
  ])('aborts an active %s transcription on unmount', async (_name, modelId) => {
    let finishFetch!: (response: ReturnType<typeof successfulResponse>) => void
    let signal!: AbortSignal
    mockFetch.mockImplementationOnce(async (_url: string, init: RequestInit) => {
      signal = init.signal as AbortSignal
      return await new Promise<ReturnType<typeof successfulResponse>>((resolve) => {
        finishFetch = resolve
      })
    })
    const onTranscriptReady = jest.fn()
    const { result, unmount } = renderHook(() => useVoiceRecording(onTranscriptReady, modelId))
    beginRecording(result)

    let transcription!: Promise<void>
    act(() => {
      transcription = result.current.onRecordingStop('', audioBlob)
    })
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))

    unmount()
    expect(signal.aborted).toBe(true)
    await act(async () => {
      finishFetch(successfulResponse('must be ignored'))
      await transcription
    })
    expect(onTranscriptReady).not.toHaveBeenCalled()
    expect(mockSetIsAsrLoading).toHaveBeenLastCalledWith(false)
  })

  it('does not launch a second request for a duplicate stop callback', async () => {
    let finishFetch!: (response: ReturnType<typeof successfulResponse>) => void
    mockFetch.mockImplementationOnce(async () => (
      await new Promise<ReturnType<typeof successfulResponse>>((resolve) => {
        finishFetch = resolve
      })
    ))
    const onTranscriptReady = jest.fn()
    const { result } = renderHook(() => (
      useVoiceRecording(onTranscriptReady, CUSTOM_OPENAI_MODEL_ID)
    ))
    beginRecording(result)

    let first!: Promise<void>
    act(() => {
      first = result.current.onRecordingStop('', audioBlob)
    })
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))
    await act(async () => result.current.onRecordingStop('', audioBlob))
    expect(mockFetch).toHaveBeenCalledTimes(1)

    await act(async () => {
      finishFetch(successfulResponse('single transcript'))
      await first
    })
    expect(onTranscriptReady).toHaveBeenCalledTimes(1)
  })

  it('remains usable after the StrictMode effect rehearsal', async () => {
    mockFetch.mockResolvedValueOnce(successfulResponse('strict transcript'))
    const onTranscriptReady = jest.fn()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <StrictMode>{children}</StrictMode>
    )
    const { result } = renderHook(
      () => useVoiceRecording(onTranscriptReady, CUSTOM_OPENAI_MODEL_ID),
      { wrapper },
    )
    beginRecording(result)

    await act(async () => result.current.onRecordingStop('', audioBlob))

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(onTranscriptReady).toHaveBeenCalledWith('strict transcript')
  })
})
