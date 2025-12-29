import { useCallback, useEffect, useRef, useState } from "react"
import { useAsr } from "@/src/application/providers/asr.provider"
import { useApiKey } from "@/src/application/providers/api-key.provider"
import { PROXY_CLIENT_KEY, WHISPER_PROXY_URL, hasWhisperProxy } from "@/src/shared/config/env.config"

export function useVoiceRecording() {
  const { asrText, setAsrText, isAsrLoading, setIsAsrLoading } = useAsr()
  const { apiKey } = useApiKey()
  const [isRecording, setIsRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [asrError, setAsrError] = useState<string | null>(null)
  const [lastTranscript, setLastTranscript] = useState<{ text: string; timestamp: string } | null>(null)
  
  const timerRef = useRef<number | null>(null)
  const startRecordingRef = useRef<() => void>(() => {})
  const stopRecordingRef = useRef<() => void>(() => {})
  const asrTextRef = useRef(asrText)

  useEffect(() => {
    asrTextRef.current = asrText
  }, [asrText])

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

  useEffect(() => () => stopTimer(), [stopTimer])

  const handleWhisperRequest = useCallback(
    async (audioBlob: Blob) => {
      if (audioBlob.size === 0) return

      const useProxy = !apiKey && hasWhisperProxy

      if (!apiKey && !useProxy) {
        alert("Add your OpenAI API key in Settings or configure the ASR proxy endpoint.")
        return
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

        const timestamp = new Date().toLocaleTimeString()
        setLastTranscript({ text, timestamp })

        const previous = asrTextRef.current?.trim?.() ? asrTextRef.current : asrTextRef.current ?? ""
        const separator = previous ? "\n\n---\n\n" : ""
        const updatedAsr = `${previous}${separator}[${timestamp}] ${text}`.trim()
        asrTextRef.current = updatedAsr
        setAsrText(updatedAsr)

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
    [apiKey, setIsAsrLoading, setAsrText]
  )

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

  const handleStopRecording = useCallback(() => {
    stopRecordingRef.current()
  }, [])

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      handleStopRecording()
    } else {
      handleStartRecording()
    }
  }, [handleStartRecording, handleStopRecording, isRecording])

  const handleClearHistory = useCallback(() => {
    asrTextRef.current = ""
    setAsrText("")
    setLastTranscript(null)
  }, [setAsrText])

  return {
    isRecording,
    setIsRecording,
    isAsrLoading,
    asrError,
    asrText,
    lastTranscript,
    seconds,
    startTimer,
    stopTimer,
    handleWhisperRequest,
    toggleRecording,
    handleClearHistory,
    startRecordingRef,
    stopRecordingRef,
  }
}
