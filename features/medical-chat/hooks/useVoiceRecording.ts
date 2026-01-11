import { useCallback, useEffect, useRef, useState } from "react"
import { useAsr } from "@/src/application/providers/asr.provider"
import { useAiConfigStore } from "@/src/application/stores/ai-config.store"
import { PROXY_CLIENT_KEY, WHISPER_PROXY_URL, hasWhisperProxy } from "@/src/shared/config/env.config"

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
export function useVoiceRecording(onTranscriptReady?: (text: string) => void) {
  const { isAsrLoading, setIsAsrLoading } = useAsr()
  const apiKey = useAiConfigStore((state) => state.apiKey)
  
  // Internal state - 內部狀態
  const [isRecording, setIsRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [asrError, setAsrError] = useState<string | null>(null)
  
  // Internal refs - 內部引用
  const timerRef = useRef<number | null>(null)
  const startRecordingRef = useRef<() => void>(() => {})
  const stopRecordingRef = useRef<() => void>(() => {})

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

  // Cleanup timer on unmount
  useEffect(() => () => stopTimer(), [stopTimer])

  // Whisper API request - 語音轉文字 API 請求
  const transcribeAudio = useCallback(
    async (audioBlob: Blob): Promise<string | null> => {
      if (audioBlob.size === 0) return null

      const useProxy = !apiKey && hasWhisperProxy

      if (!apiKey && !useProxy) {
        alert("Add your OpenAI API key in Settings or configure the ASR proxy endpoint.")
        return null
      }

      setIsAsrLoading(true)
      setAsrError(null)

      const formData = new FormData()
      formData.append("file", audioBlob, "audio.webm")
      formData.append("model", "whisper-1")

      try {
        const targetUrl = useProxy ? WHISPER_PROXY_URL : "https://api.openai.com/v1/audio/transcriptions"
        const headers: Record<string, string> = {}

        if (useProxy) {
          if (!WHISPER_PROXY_URL) {
            throw new Error("Whisper proxy URL is not configured")
          }
          if (PROXY_CLIENT_KEY) {
            headers["x-proxy-key"] = PROXY_CLIENT_KEY
          }
        } else if (apiKey) {
          headers["Authorization"] = `Bearer ${apiKey}`
        }

        const response = await fetch(targetUrl, {
          method: "POST",
          headers,
          body: formData,
        })

        if (!response.ok) {
          throw new Error(`API request failed with status ${response.status}`)
        }

        const result = await response.json()
        const text =
          result?.transcript?.trim() ||
          result?.text?.trim() ||
          result?.openAiResponse?.text?.trim() ||
          ""

        if (!text) {
          throw new Error("No transcription returned")
        }

        return text
      } catch (err) {
        console.error("ASR transcription error:", err)
        const message = err instanceof Error ? err.message : "Failed to transcribe audio"
        setAsrError(message)
        return null
      } finally {
        setIsAsrLoading(false)
      }
    },
    [apiKey, setIsAsrLoading]
  )

  // Start recording - 開始錄音（內部使用）
  const handleStartRecording = useCallback(() => {
    if (isAsrLoading) return

    if (!apiKey && !hasWhisperProxy) {
      alert("Add your OpenAI API key in Settings or configure the ASR proxy endpoint.")
      return
    }

    setAsrError(null)
    setSeconds(0)
    startRecordingRef.current()
  }, [apiKey, isAsrLoading])

  // Stop recording - 停止錄音（內部使用）
  const handleStopRecording = useCallback(() => {
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
    setIsRecording(true)
    startTimer()
  }, [startTimer])

  // ReactMediaRecorder onStop callback - 錄音停止時的回調（自動轉錄）
  const onRecordingStop = useCallback(
    async (_url: string, blob: Blob) => {
      setIsRecording(false)
      stopTimer()
      
      const text = await transcribeAudio(blob)
      if (text && onTranscriptReady) {
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
