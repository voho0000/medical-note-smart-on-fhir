"use client"

import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import { Loader2, Mic, Square } from "lucide-react"

const ReactMediaRecorder = dynamic(async () => (await import("react-media-recorder")).ReactMediaRecorder, {
  ssr: false,
})

interface VoiceRecorderProps {
  isRecording: boolean
  isLoading: boolean
  onToggleRecording: () => void
  onRecordingStart: () => void
  onRecordingStop: (blob: Blob) => Promise<void>
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
  return (
    <>
      <Button
        type="button"
        variant={isRecording ? "destructive" : "outline"}
        size="sm"
        onClick={onToggleRecording}
        disabled={isLoading}
        className="flex items-center gap-2"
        aria-pressed={isRecording}
      >
        {isRecording ? (
          <>
            <Square className="h-4 w-4" />
            Stop Recording
          </>
        ) : isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Processing…
          </>
        ) : (
          <>
            <Mic className="h-4 w-4" />
            Record Voice
          </>
        )}
      </Button>
      <ReactMediaRecorder
        audio
        onStart={onRecordingStart}
        onStop={async (_url, blob) => {
          await onRecordingStop(blob)
        }}
        render={({ startRecording, stopRecording }) => {
          startRecordingRef.current = startRecording
          stopRecordingRef.current = stopRecording
          return <div className="hidden" />
        }}
      />
    </>
  )
}
