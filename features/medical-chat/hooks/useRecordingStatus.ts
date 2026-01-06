// Recording Status Formatting Hook
import { useMemo } from "react"

interface RecordingState {
  isRecording: boolean
  isAsrLoading: boolean
  seconds: number
}

export function useRecordingStatus(voice: RecordingState) {
  const formattedRecordingDuration = useMemo(() => {
    const minutes = Math.floor(voice.seconds / 60)
    const secs = (voice.seconds % 60).toString().padStart(2, "0")
    return `${minutes}:${secs}`
  }, [voice.seconds])

  const recordingStatusLabel = useMemo(() => {
    if (voice.isRecording) {
      return `Recording… ${formattedRecordingDuration}`
    }
    if (voice.isAsrLoading) {
      return "Transcribing audio…"
    }
    return ""
  }, [formattedRecordingDuration, voice.isAsrLoading, voice.isRecording])

  return {
    recordingStatusLabel,
  }
}
