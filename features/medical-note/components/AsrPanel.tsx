// features/medical-note/components/AsrPanel.tsx
"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { ReactMediaRecorder } from "react-media-recorder"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useApiKey } from "@/lib/providers/ApiKeyProvider"
import { WHISPER_PROXY_URL, PROXY_CLIENT_KEY, hasWhisperProxy } from "@/lib/config/ai"
import { useAsr } from "../context/AsrContext"

export function AsrPanel() {
  const { asrText, setAsrText, isAsrLoading, setIsAsrLoading } = useAsr()
  const { apiKey } = useApiKey()
  const [isRecording, setIsRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const timerRef = useRef<number | null>(null)
  const startRecordingRef = useRef<() => void>(() => {})
  const stopRecordingRef = useRef<() => void>(() => {})

  const startTimer = useCallback(() => { 
    stopTimer()
    timerRef.current = window.setInterval(() => {
      setSeconds(prevSeconds => prevSeconds + 1)
    }, 1000)
  }, [])
  
  const stopTimer = useCallback(() => { 
    if (timerRef.current) { 
      clearInterval(timerRef.current)
      timerRef.current = null
    } 
  }, [])

  // Clean up timer on unmount
  useEffect(() => {
    return () => stopTimer()
  }, [stopTimer])

  const handleWhisperRequest = useCallback(async (audioBlob: Blob) => {
    const useProxy = !apiKey && hasWhisperProxy

    if (!apiKey && !useProxy) {
      alert("Add your OpenAI API key in Settings or configure the ASR proxy endpoint.")
      return
    }

    setIsAsrLoading(true)
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
        "No transcription returned."

      // Append new transcription with timestamp
      const timestamp = new Date().toLocaleTimeString()
      const separator = asrText ? "\n\n---\n\n" : ""
      const newText = `${asrText}${separator}[${timestamp}] ${text}`
      setAsrText(newText)
      
    } catch (error) {
      console.error("ASR transcription error:", error)
      const errorMessage = error instanceof Error ? error.message : "Failed to transcribe audio"
      const errorText = asrText 
        ? `${asrText}\n\n[Error] ${errorMessage}` 
        : `[Error] ${errorMessage}`
      setAsrText(errorText)
    } finally { 
      setIsAsrLoading(false) 
    }
  }, [apiKey, asrText, setAsrText, setIsAsrLoading])

  const handleStartRecording = useCallback(() => {
    if (!apiKey && !hasWhisperProxy) {
      alert("Add your OpenAI API key in Settings or configure the ASR proxy endpoint.")
      return
    }
    startRecordingRef.current()
  }, [apiKey])

  const handleStopRecording = useCallback(() => {
    stopRecordingRef.current()
  }, [])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audio Speech Recognition (ASR)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3 mb-4">
          <Button
            variant={isRecording ? "destructive" : "default"}
            onMouseDown={handleStartRecording}
            onMouseUp={handleStopRecording}
            onMouseLeave={isRecording ? handleStopRecording : undefined}
            onTouchStart={handleStartRecording}
            onTouchEnd={handleStopRecording}
            disabled={isAsrLoading}
            className="flex-1"
          >
            {isRecording ? (
              <>
                <span className="relative flex h-3 w-3 mr-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                </span>
                Recording... {Math.floor(seconds / 60)}:{(seconds % 60).toString().padStart(2, '0')}
              </>
            ) : isAsrLoading ? (
              'Processing...'
            ) : (
              'Hold to Record (or tap and hold on mobile)'
            )}
          </Button>
        </div>

        <div className="space-y-2">
          <Textarea
            value={asrText}
            onChange={(e) => setAsrText(e.target.value)}
            placeholder="Transcription will appear here..."
            className="min-h-[200px]"
            disabled={isAsrLoading}
          />
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>{asrText.length} characters</span>
            <button 
              onClick={() => setAsrText('')} 
              className="text-sm text-muted-foreground hover:text-foreground"
              disabled={!asrText || isAsrLoading}
            >
              Clear
            </button>
          </div>
        </div>

        <ReactMediaRecorder
          audio
          onStart={() => {
            setIsRecording(true)
            setSeconds(0)
            startTimer()
          }}
          onStop={async (_url, blob) => { 
            setIsRecording(false)
            stopTimer()
            await handleWhisperRequest(blob)
          }}
          render={({ startRecording, stopRecording }) => {
            startRecordingRef.current = startRecording
            stopRecordingRef.current = stopRecording
            // Return a small, hidden div instead of null
            return <div className="hidden" />
          }}
        />
      </CardContent>
    </Card>
  )
}
