import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { useAsr } from "@/src/application/providers/asr.provider"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useAiConfigStore } from "@/src/application/stores/ai-config.store"
import { PROXY_CLIENT_KEY, WHISPER_PROXY_URL, hasWhisperProxy } from "@/src/shared/config/env.config"
import { getProxyAuthHeaders } from "@/src/infrastructure/ai/utils/proxy-auth"
import type { OpenAiCompatibleProfile } from '@/src/shared/types/openai-compatible.types'
import { normalizeOpenAiCompatibleTransport } from '@/src/shared/types/openai-compatible.types'
import {
  isOpenAiCompatibleRuntimeReady,
  openAiCompatibleEndpointUrl,
  resolveOpenAiCompatibleProfile,
} from '@/src/shared/utils/openai-compatible.utils'
import { isCustomOpenAiModelId } from '@/src/shared/constants/ai-models.constants'

interface RecordingSession {
  customModelId: string | null
  profile: OpenAiCompatibleProfile | null
}

interface ActiveTranscription extends RecordingSession {
  requestId: number
  controller: AbortController
}

/**
 * Voice Recording Hook - 語音錄製與轉錄
 * 
 * 設計原則：
 * 1. 封裝內部狀態 - 外部無法直接修改 isRecording, seconds 等狀態
 * 2. 單一職責 - 所有錄音相關邏輯都在此 hook 內完成
 * 3. 最小 API - 只暴露必要的公開方法和狀態
 * 
 * 使用方式：
 * - toggleRecording(): 切換錄音狀態
 * - onRecordingStart: 傳給 ReactMediaRecorder 的 onStart
 * - onRecordingStop: 傳給 ReactMediaRecorder 的 onStop（會自動轉錄）
 */
export function useVoiceRecording(
  onTranscriptReady?: (text: string) => void,
  openAiCompatibleModelId?: string | null,
) {
  const { isAsrLoading, setIsAsrLoading } = useAsr()
  const { t } = useLanguage()
  
  // Internal state - 內部狀態
  const [isRecording, setIsRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [asrError, setAsrError] = useState<string | null>(null)
  
  // Internal refs - 內部引用
  const timerRef = useRef<number | null>(null)
  const startRecordingRef = useRef<() => void>(() => {})
  const stopRecordingRef = useRef<() => void>(() => {})
  const recordingSessionRef = useRef<RecordingSession | null>(null)
  const activeTranscriptionRef = useRef<ActiveTranscription | null>(null)
  const requestSequenceRef = useRef(0)
  const mountedRef = useRef(true)

  // Timer management - 計時器管理（內部使用）
  const startTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
    }
    timerRef.current = window.setInterval(() => {
      setSeconds((prev) => prev + 1)
    }, 1000)
  }, [])

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  // A custom audio request must obey the same connection lifecycle as chat:
  // editing, disabling, or deleting the exact profile immediately revokes the
  // in-flight request. Unmount also aborts before any stale callback can accept
  // the old endpoint's response.
  useEffect(() => {
    mountedRef.current = true
    const unsubscribe = useAiConfigStore.subscribe((state, previousState) => {
      if (state.openAiCompatibleProfiles === previousState.openAiCompatibleProfiles) return
      const active = activeTranscriptionRef.current
      if (!active?.customModelId) return
      const liveProfile = resolveOpenAiCompatibleProfile(
        active.customModelId,
        state.openAiCompatibleProfiles,
      )
      if (
        liveProfile !== active.profile ||
        !isOpenAiCompatibleRuntimeReady(liveProfile) ||
        normalizeOpenAiCompatibleTransport(liveProfile.transport) !== 'direct'
      ) {
        active.controller.abort()
      }
    })

    return () => {
      mountedRef.current = false
      unsubscribe()
      activeTranscriptionRef.current?.controller.abort()
      activeTranscriptionRef.current = null
      recordingSessionRef.current = null
      setIsAsrLoading(false)
      stopTimer()
    }
  }, [setIsAsrLoading, stopTimer])

  // Whisper API request - 語音轉文字 API 請求
  const transcribeAudio = useCallback(
    async (audioBlob: Blob, session: RecordingSession): Promise<string | null> => {
      if (!mountedRef.current || audioBlob.size === 0) return null

      const liveConfig = useAiConfigStore.getState()
      const customEndpointRequested = Boolean(session.customModelId)
      const liveProfile = session.customModelId
        ? resolveOpenAiCompatibleProfile(
            session.customModelId,
            liveConfig.openAiCompatibleProfiles,
          )
        : null
      const openAiCompatible = session.profile

      // The Firebase BYO gateway intentionally exposes only models + chat.
      // Audio stays direct so a gateway profile cannot silently bypass its
      // declared data path or fail on an unsupported endpoint.
      const useCustomEndpoint = liveProfile === openAiCompatible &&
        isOpenAiCompatibleRuntimeReady(openAiCompatible) &&
        normalizeOpenAiCompatibleTransport(openAiCompatible.transport) === 'direct'
      const liveApiKey = liveConfig.apiKey
      const useProxy = !customEndpointRequested && !liveApiKey && hasWhisperProxy

      // A selected hospital model is a privacy boundary. If its exact profile
      // is unavailable (or gateway-only, where audio is unsupported), do not
      // silently redirect the recording to OpenAI or the Firebase proxy.
      if (
        (customEndpointRequested && !useCustomEndpoint) ||
        (!customEndpointRequested && !liveApiKey && !useProxy)
      ) {
        toast.error(t.chat.voiceNeedsApiKey)
        return null
      }

      setIsAsrLoading(true)
      setAsrError(null)

      const formData = new FormData()
      formData.append("file", audioBlob, "audio.webm")
      formData.append("model", "whisper-1")

      const abortController = new AbortController()
      activeTranscriptionRef.current?.controller.abort()
      requestSequenceRef.current += 1
      const active: ActiveTranscription = {
        requestId: requestSequenceRef.current,
        controller: abortController,
        customModelId: session.customModelId,
        profile: openAiCompatible,
      }
      activeTranscriptionRef.current = active
      const isCurrentRequest = () => (
        mountedRef.current &&
        !abortController.signal.aborted &&
        activeTranscriptionRef.current?.requestId === active.requestId
      )

      try {
        const targetUrl = useCustomEndpoint
          ? openAiCompatibleEndpointUrl(openAiCompatible.baseUrl, 'audio/transcriptions')
          : useProxy
            ? WHISPER_PROXY_URL
            : "https://api.openai.com/v1/audio/transcriptions"
        const headers: Record<string, string> = {}

        if (useCustomEndpoint) {
          if (openAiCompatible.apiKey) {
            headers.Authorization = `Bearer ${openAiCompatible.apiKey}`
          }
        } else if (useProxy) {
          if (!WHISPER_PROXY_URL) {
            throw new Error("Whisper proxy URL is not configured")
          }
          if (PROXY_CLIENT_KEY) {
            headers["x-proxy-key"] = PROXY_CLIENT_KEY
          }
          const proxyHeaders = await getProxyAuthHeaders()
          if (!isCurrentRequest()) return null
          Object.assign(headers, proxyHeaders)
        } else if (liveApiKey) {
          headers["Authorization"] = `Bearer ${liveApiKey}`
        }

        const response = await fetch(targetUrl, {
          method: "POST",
          headers,
          body: formData,
          credentials: useCustomEndpoint ? 'omit' : undefined,
          referrerPolicy: useCustomEndpoint ? 'no-referrer' : undefined,
          signal: abortController.signal,
        })

        if (!isCurrentRequest()) return null

        if (!response.ok) {
          throw new Error(`API request failed with status ${response.status}`)
        }

        const result = await response.json()
        if (!isCurrentRequest()) return null
        const text =
          result?.transcript?.trim() ||
          result?.text?.trim() ||
          result?.openAiResponse?.text?.trim() ||
          ""

        if (!text && isCurrentRequest()) {
          // Whisper returns empty when the clip has no detectable speech (e.g.
          // the user tapped record but didn't say anything). That's expected,
          // not an error — inform gently and bail without a scary message.
          toast.info(t.chat.voiceNoSpeech)
          return null
        }

        return isCurrentRequest() ? text : null
      } catch (err) {
        if (!isCurrentRequest()) return null
        console.error("ASR transcription error:", err)
        const message = err instanceof Error ? err.message : "Failed to transcribe audio"
        setAsrError(message)
        return null
      } finally {
        if (activeTranscriptionRef.current?.requestId === active.requestId) {
          activeTranscriptionRef.current = null
          if (mountedRef.current) setIsAsrLoading(false)
        }
      }
    },
    [setIsAsrLoading, t]
  )

  // Start recording - 開始錄音（內部使用）
  const handleStartRecording = useCallback(() => {
    if (!mountedRef.current || isAsrLoading) return

    const liveConfig = useAiConfigStore.getState()
    const customModelId = openAiCompatibleModelId &&
      isCustomOpenAiModelId(openAiCompatibleModelId)
        ? openAiCompatibleModelId
        : null
    const customEndpointRequested = Boolean(customModelId)
    const openAiCompatible = customModelId
      ? resolveOpenAiCompatibleProfile(
          customModelId,
          liveConfig.openAiCompatibleProfiles,
        )
      : null
    const hasDirectCustomAudio = isOpenAiCompatibleRuntimeReady(openAiCompatible) &&
      normalizeOpenAiCompatibleTransport(openAiCompatible.transport) === 'direct'
    if (
      (customEndpointRequested && !hasDirectCustomAudio) ||
      (!customEndpointRequested && !liveConfig.apiKey && !hasWhisperProxy)
    ) {
      toast.error(t.chat.voiceNeedsApiKey)
      recordingSessionRef.current = null
      return
    }

    // Bind the recording to the exact connection present when the user starts
    // speaking. A later picker switch cannot redirect that audio to model B;
    // editing/deleting model A makes the stop callback fail closed instead.
    recordingSessionRef.current = {
      customModelId,
      profile: openAiCompatible,
    }
    setAsrError(null)
    setSeconds(0)
    startRecordingRef.current()
  }, [openAiCompatibleModelId, isAsrLoading, t])

  // Stop recording - 停止錄音（內部使用）
  const handleStopRecording = useCallback(() => {
    if (!mountedRef.current) return
    stopRecordingRef.current()
  }, [])

  // Toggle recording - 切換錄音狀態（公開 API）
  const toggleRecording = useCallback(() => {
    if (isRecording) {
      handleStopRecording()
    } else {
      handleStartRecording()
    }
  }, [handleStartRecording, handleStopRecording, isRecording])

  // ReactMediaRecorder onStart callback - 錄音開始時的回調
  const onRecordingStart = useCallback(() => {
    if (!mountedRef.current || !recordingSessionRef.current) return
    setIsRecording(true)
    startTimer()
  }, [startTimer])

  // ReactMediaRecorder onStop callback - 錄音停止時的回調（自動轉錄）
  const onRecordingStop = useCallback(
    async (_url: string, blob: Blob) => {
      if (!mountedRef.current) return
      setIsRecording(false)
      stopTimer()

      const session = recordingSessionRef.current
      recordingSessionRef.current = null
      if (!session) return
      const text = await transcribeAudio(blob, session)
      const liveProfile = session.customModelId
        ? resolveOpenAiCompatibleProfile(
            session.customModelId,
            useAiConfigStore.getState().openAiCompatibleProfiles,
          )
        : null
      const sessionStillAuthorized = !session.customModelId || (
        liveProfile === session.profile &&
        isOpenAiCompatibleRuntimeReady(liveProfile) &&
        normalizeOpenAiCompatibleTransport(liveProfile.transport) === 'direct'
      )
      if (mountedRef.current && sessionStillAuthorized && text && onTranscriptReady) {
        onTranscriptReady(text)
      }
    },
    [stopTimer, transcribeAudio, onTranscriptReady]
  )

  // Public API - 公開介面
  return {
    // Read-only state - 只讀狀態
    isRecording,
    isAsrLoading,
    asrError,
    seconds,
    
    // Public method - 公開方法
    toggleRecording,
    
    // ReactMediaRecorder integration - ReactMediaRecorder 整合
    startRecordingRef,
    stopRecordingRef,
    onRecordingStart,
    onRecordingStop,
  }
}
