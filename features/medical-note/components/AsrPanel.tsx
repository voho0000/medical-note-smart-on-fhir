// features/medical-note/components/AsrPanel.tsx
"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { ReactMediaRecorder } from "react-media-recorder"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useApiKey } from "@/lib/providers/ApiKeyProvider"
import { useNote } from "../providers/NoteProvider"

export function AsrPanel() {
  const { asrText, setAsrText } = useNote()
  const { apiKey } = useApiKey()
  const [isRecording, setIsRecording] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const timerRef = useRef<number | null>(null)

  const startTimer = () => { stopTimer(); timerRef.current = window.setInterval(() => setSeconds(s => s + 1), 1000) }
  const stopTimer = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null } }
  useEffect(() => () => stopTimer(), [])

  const handleWhisperRequest = useCallback(async (audioBlob: Blob) => {
    if (!apiKey) { alert("請先在上方輸入 OpenAI API key"); return }
    setIsLoading(true)
    const fd = new FormData()
    fd.append("file", audioBlob, "audio.webm")
    fd.append("model", "whisper-1")
    try {
      const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: fd,
      })
      const j = await r.json()
      const text = j?.text || "Failed to transcribe audio."
      setAsrText(prev => (prev ? prev + "\n" : "") + text)
    } catch {
      setAsrText(prev => (prev ? prev + "\n" : "") + "Failed to transcribe audio. Please try again.")
    } finally { setIsLoading(false) }
  }, [apiKey, setAsrText])

  return (
    <Card>
      <CardHeader><CardTitle>Audio Speech Recognition (ASR)</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <ReactMediaRecorder
          audio
          onStop={async (_url, blob) => { setIsRecording(false); stopTimer(); setSeconds(0); await handleWhisperRequest(blob) }}
          render={({ startRecording, stopRecording }) => (
            <div className="flex items-center gap-3">
              {isRecording ? (
                <>
                  <Button variant="destructive" onClick={stopRecording}>Stop Recording</Button>
                  <span className="text-sm tabular-nums">{`Recording: ${seconds}s`}</span>
                </>
              ) : (
                <Button onClick={() => { if (!apiKey) { alert("請先輸入 API key"); return } setIsRecording(true); setSeconds(0); startTimer(); startRecording() }}>
                  Start Recording
                </Button>
              )}
              {isLoading && <span className="text-sm text-muted-foreground">Transcribing…</span>}
            </div>
          )}
        />
        <Textarea value={asrText} onChange={(e) => setAsrText(e.target.value)} className="min-h-[60px]" spellCheck={false} />
      </CardContent>
    </Card>
  )
}
