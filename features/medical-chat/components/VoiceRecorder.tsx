"use client"

import dynamic from "next/dynamic"
import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/src/application/providers/language.provider"
import { Loader2, Mic, StopCircle } from "lucide-react"

const ReactMediaRecorder = dynamic(
  () => import("react-media-recorder").then((mod) => ({ default: mod.ReactMediaRecorder })),
  { ssr: false }
)

// Reports the live mic stream upward, but only when the underlying audio track
// changes — react-media-recorder rebuilds previewAudioStream every render, so
// reporting it raw would loop (setState → re-render → new object → setState…).
function StreamReporter({
  stream,
  onReport,
}: {
  stream: MediaStream | null
  onReport?: (stream: MediaStream | null) => void
}) {
  const trackId = stream?.getAudioTracks()[0]?.id ?? null
  useEffect(() => {
    onReport?.(stream)
    return () => onReport?.(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId])
  return null
}

interface VoiceRecorderProps {
  isRecording: boolean
  isLoading: boolean
  onToggleRecording: () => void
  onRecordingStart: () => void
  onRecordingStop: (url: string, blob: Blob) => Promise<void>
  startRecordingRef: React.MutableRefObject<() => void>
  stopRecordingRef: React.MutableRefObject<() => void>
  /** Receives the live audio stream while recording (null when stopped) */
  onStreamChange?: (stream: MediaStream | null) => void
}

export function VoiceRecorder({
  isRecording,
  isLoading,
  onToggleRecording,
  onRecordingStart,
  onRecordingStop,
  startRecordingRef,
  stopRecordingRef,
  onStreamChange,
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
        render={({ startRecording, stopRecording, previewAudioStream }) => {
          startRecordingRef.current = startRecording
          stopRecordingRef.current = stopRecording
          return <StreamReporter stream={previewAudioStream ?? null} onReport={onStreamChange} />
        }}
      />
    </>
  )
}
