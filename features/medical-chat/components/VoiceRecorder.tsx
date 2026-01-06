"use client"

import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/src/application/providers/language.provider"
import { Loader2, Mic, StopCircle } from "lucide-react"

const ReactMediaRecorder = dynamic(async () => (await import("react-media-recorder")).ReactMediaRecorder, {
  ssr: false,
})

interface VoiceRecorderProps {
  isRecording: boolean
  isLoading: boolean
  onToggleRecording: () => void
  onRecordingStart: () => void
  onRecordingStop: (url: string, blob: Blob) => Promise<void>
  startRecordingRef: React.MutableRefObject<() => void>
  stopRecordingRef: React.MutableRefObject<() => void>
}

export function VoiceRecorder({
  isRecording,
  isLoading,
  onToggleRecording,
  onRecordingStart,
  onRecordingStop,
  startRecordingRef,
  stopRecordingRef,
}: VoiceRecorderProps) {
  const { t } = useLanguage()
  
  return (
    <>
      <Button
        type="button"
        variant={isRecording ? "destructive" : "outline"}
        size="icon"
        onClick={onToggleRecording}
        disabled={isLoading}
        className="h-10 w-10 shrink-0"
        aria-label={isRecording ? t.chat.stopRecording : isLoading ? t.chat.processing : t.chat.recordVoice}
        aria-pressed={isRecording}
      >
        {isRecording ? (
          <StopCircle className="h-4 w-4" />
        ) : isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Mic className="h-4 w-4" />
        )}
      </Button>
      <ReactMediaRecorder
        audio
        onStart={onRecordingStart}
        onStop={onRecordingStop}
        render={({ startRecording, stopRecording }) => {
          startRecordingRef.current = startRecording
          stopRecordingRef.current = stopRecording
          return <div className="hidden" />
        }}
      />
    </>
  )
}
