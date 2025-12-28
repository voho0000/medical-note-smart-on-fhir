"use client"

import dynamic from "next/dynamic"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { useNote, type ChatMessage } from "@/features/medical-note/providers/NoteProvider"
import { useGptQuery } from "@/features/medical-note/hooks/useGptQuery"
import { useClinicalContext } from "@/features/data-selection/hooks/useClinicalContext"
import { useAsr } from "@/features/medical-note/context/AsrContext"
import { useDataSelection } from "@/features/data-selection/hooks/useDataSelection"
import { usePatient } from "@/lib/providers/PatientProvider"
import { useApiKey } from "@/lib/providers/ApiKeyProvider"
import { Loader2, Mic, Square, Plus, Trash2, FileText } from "lucide-react"
import { PROXY_CLIENT_KEY, WHISPER_PROXY_URL, hasWhisperProxy } from "@/lib/config/ai"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { usePromptTemplates } from "@/features/medical-chat/context/PromptTemplatesContext"

const ReactMediaRecorder = dynamic(async () => (await import("react-media-recorder")).ReactMediaRecorder, {
  ssr: false,
})

function createMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${role}-${Date.now()}`,
    role,
    content,
    timestamp: Date.now(),
  }
}

export function MedicalChat() {
  const { chatMessages, setChatMessages, model } = useNote()
  const { asrText, setAsrText, isAsrLoading, setIsAsrLoading } = useAsr()
  const { getFullClinicalContext } = useClinicalContext()
  const { patient: currentPatient } = usePatient()
  const { selectedData } = useDataSelection()
  const { apiKey } = useApiKey()
  const { templates } = usePromptTemplates()
  const [input, setInput] = useState("")
  const [isResetting, setIsResetting] = useState(false)
  const [lastTranscript, setLastTranscript] = useState<{ text: string; timestamp: string } | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [asrError, setAsrError] = useState<string | null>(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("")
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const timerRef = useRef<number | null>(null)
  const startRecordingRef = useRef<() => void>(() => {})
  const stopRecordingRef = useRef<() => void>(() => {})
  const asrTextRef = useRef(asrText)

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

  const clinicalContext = useMemo(() => getFullClinicalContext(), [getFullClinicalContext])

  useEffect(() => {
    asrTextRef.current = asrText
  }, [asrText])

  const selectedTemplate = useMemo(() => {
    if (!templates.length) {
      return undefined
    }
    const fallback = templates[0]
    if (!selectedTemplateId) {
      return fallback
    }
    return templates.find((template) => template.id === selectedTemplateId) ?? fallback
  }, [selectedTemplateId, templates])

  useEffect(() => {
    if (!templates.length) {
      setSelectedTemplateId("")
      return
    }
    if (!templates.some((template) => template.id === selectedTemplateId)) {
      setSelectedTemplateId(templates[0].id)
    }
  }, [selectedTemplateId, templates])

  const formattedRecordingDuration = useMemo(() => {
    const minutes = Math.floor(seconds / 60)
    const secs = (seconds % 60).toString().padStart(2, "0")
    return `${minutes}:${secs}`
  }, [seconds])

  const handleWhisperRequest = useCallback(
    async (audioBlob: Blob) => {
      if (audioBlob.size === 0) {
        return
      }

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

        setInput((prev: string) => (prev.trim().length > 0 ? `${prev.trimEnd()}\n\n${text}` : text))
      } catch (err) {
        console.error("ASR transcription error:", err)
        const message = err instanceof Error ? err.message : "Failed to transcribe audio"
        setAsrError(message)
      } finally {
        setIsAsrLoading(false)
      }
    },
    [apiKey, setIsAsrLoading, setAsrText, setAsrError]
  )

  const handleStartRecording = useCallback(() => {
    if (isAsrLoading) {
      return
    }

    if (!apiKey && !hasWhisperProxy) {
      alert("Add your OpenAI API key in Settings or configure the ASR proxy endpoint.")
      return
    }

    setAsrError(null)
    setSeconds(0)
    startRecordingRef.current()
  }, [apiKey, isAsrLoading, setAsrError])

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

  const latestTranscriptPreview = useMemo(() => {
    if (!lastTranscript) {
      return ""
    }
    const { text } = lastTranscript
    return text.length > 160 ? `${text.slice(0, 160)}…` : text
  }, [lastTranscript])

  const recordingStatusLabel = useMemo(() => {
    if (isRecording) {
      return `Recording… ${formattedRecordingDuration}`
    }
    if (isAsrLoading) {
      return "Transcribing audio…"
    }
    return ""
  }, [formattedRecordingDuration, isAsrLoading, isRecording])

  const systemPrompt = useMemo(() => {
    const nameEntry = currentPatient?.name?.[0]
    const given = nameEntry?.given?.join(" ")?.trim()
    const family = nameEntry?.family?.trim()
    const patientName = [given, family].filter(Boolean).join(" ") || "the patient"
    const patientDetails = selectedData.patientInfo
      ? clinicalContext
      : clinicalContext.replace(/Patient Information:[\s\S]*?(?=\n\n|$)/, "").trim()

    return [
      "You are a helpful medical assistant helping clinicians compose medical notes.",
      "Be concise, evidence-based, and note uncertainties when appropriate.",
      "If the conversation includes updated clinical context, reference it directly instead of prior context.",
      "Patient Context:",
      patientDetails || "No clinical context available.",
      `Patient Name: ${patientName}`,
    ].join("\n")
  }, [clinicalContext, currentPatient?.name, selectedData.patientInfo])

  const { queryGpt, isLoading, error } = useGptQuery()

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [chatMessages, isLoading])

  const handleSend = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed) return

    const userMessage = createMessage("user", trimmed)
    const optimisticMessages = [...chatMessages, userMessage]
    setChatMessages(optimisticMessages)
    setInput("")

    try {
      const gptMessages = [
        { role: "system" as const, content: systemPrompt },
        ...optimisticMessages.map((message) => ({ role: message.role, content: message.content })),
      ]

      const { text } = await queryGpt(gptMessages, model)
      const assistantMessage = createMessage("assistant", text || "")
      setChatMessages((prev) => [...prev, assistantMessage])
    } catch (err) {
      const fallback = err instanceof Error ? err.message : "Failed to generate response."
      const errorMessage = createMessage("assistant", `⚠️ ${fallback}`)
      setChatMessages((prev) => [...prev, errorMessage])
    }
  }, [chatMessages, input, model, queryGpt, setChatMessages, systemPrompt])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault()
        handleSend().catch((err) => console.error("Send message failed", err))
      }
    },
    [handleSend],
  )

  const handleInsertContext = useCallback(() => {
    if (!clinicalContext) return
    setInput((prev) => (prev ? `${prev}\n\n${clinicalContext}` : clinicalContext))
  }, [clinicalContext])

  const handleInsertAsr = useCallback(() => {
    if (!asrText?.trim()) return
    setInput((prev) => (prev ? `${prev}\n\n${asrText}` : asrText))
  }, [asrText])

  const handleResetConversation = useCallback(() => {
    setIsResetting(true)
    setChatMessages([])
    setIsResetting(false)
  }, [setChatMessages])

  const handleClearAsrHistory = useCallback(() => {
    asrTextRef.current = ""
    setAsrText("")
    setLastTranscript(null)
  }, [setAsrText])

  const handleInsertTemplate = useCallback(() => {
    const templateContent = selectedTemplate?.content?.trim()
    if (!templateContent) return
    setInput((prev) => (prev ? `${prev.trimEnd()}\n\n${templateContent}` : templateContent))
  }, [selectedTemplate])

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="space-y-1 pb-2">
        <div className="flex flex-col gap-0.5">
          <CardTitle className="text-base">Medical Note Chat</CardTitle>
          <p className="text-xs text-muted-foreground">
            Ask follow-up questions or dictate updates using the microphone.
          </p>
        </div>
        {recordingStatusLabel || asrError || error ? (
          <div className="space-y-0.5 text-[11px]">
            {recordingStatusLabel ? (
              <p className="flex items-center gap-2 text-muted-foreground">
                {isRecording ? (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                  </span>
                ) : isAsrLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : null}
                {recordingStatusLabel}
              </p>
            ) : null}
            {asrError ? <p className="text-destructive">Voice input error: {asrError}</p> : null}
            {error ? <p className="text-destructive">Chat error: {error.message}</p> : null}
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="border-t p-0">
        <ScrollArea className="h-[390px] px-4">
          <div className="flex flex-col gap-3">
            {chatMessages.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                Ask follow-up questions or draft sections of the medical note. You can insert clinical context or dictate notes with the microphone.
              </div>
            ) : (
              chatMessages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex flex-col gap-1",
                    message.role === "assistant" ? "items-start" : "items-end",
                  )}
                >
                  <div
                    className={cn(
                      "rounded-md px-3 py-2 text-sm shadow-sm",
                      message.role === "assistant" ? "bg-muted" : "bg-primary text-primary-foreground",
                    )}
                  >
                    <pre className="whitespace-pre-wrap font-sans text-sm">{message.content}</pre>
                  </div>
                  <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                    {message.role === "assistant" ? "AI" : message.role === "user" ? "You" : "System"}
                  </span>
                </div>
              ))
            )}
            {isLoading ? (
              <div className="text-xs text-muted-foreground">Generating response…</div>
            ) : null}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
      </CardContent>
      <CardFooter className="flex flex-col gap-2 border-t pt-1">
        <div className="flex w-full flex-col gap-2">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <div className="flex items-center gap-0.5 rounded-md border bg-muted/30 p-0.5">
              <Button variant="ghost" size="sm" onClick={handleInsertContext} className="h-7 gap-1 px-1.5 text-xs">
                <Plus className="h-3 w-3" />
                Context
              </Button>
              <Button variant="ghost" size="sm" onClick={handleInsertAsr} disabled={!asrText} className="h-7 gap-1 px-1.5 text-xs">
                <Plus className="h-3 w-3" />
                Voice
              </Button>
            </div>
            <div className="flex items-center gap-0.5 rounded-md border border-destructive/20 bg-destructive/5 p-0.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearAsrHistory}
                disabled={!asrText}
                className="h-7 gap-1 px-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
                Voice
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetConversation}
                disabled={chatMessages.length === 0 || isResetting}
                className="h-7 gap-1 px-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
                Chat
              </Button>
            </div>
            {templates.length > 0 ? (
              <div className="flex items-center gap-0.5 rounded-md border bg-primary/5 p-0.5">
                <Select value={selectedTemplate?.id} onValueChange={setSelectedTemplateId}>
                  <SelectTrigger className="h-7 max-w-[180px] gap-1 border-0 bg-transparent px-1.5 text-xs shadow-none hover:bg-primary/10">
                    <FileText className="h-3 w-3 shrink-0" />
                    <SelectValue placeholder="Templates" className="truncate" />
                  </SelectTrigger>
                  <SelectContent align="start" className="w-[200px] text-xs">
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={handleInsertTemplate}
                  disabled={!selectedTemplate?.content?.trim()}
                  className="h-7 gap-1 px-1.5 text-xs hover:bg-primary/10"
                >
                  <Plus className="h-3 w-3" />
                  Insert
                </Button>
              </div>
            ) : null}
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-end">
            <Textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your question or instruction…"
              spellCheck={false}
              className="min-h-[72px] max-h-[240px] w-full flex-1 resize-y"
            />
            <div className="flex items-stretch gap-2 self-end sm:flex-col">
              <Button
                type="button"
                variant={isRecording ? "destructive" : "outline"}
                size="sm"
                onClick={toggleRecording}
                disabled={isAsrLoading}
                className="flex items-center gap-2"
                aria-pressed={isRecording}
              >
                {isRecording ? (
                  <>
                    <Square className="h-4 w-4" />
                    Stop Recording
                  </>
                ) : isAsrLoading ? (
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
              <Button
                onClick={() => handleSend().catch(console.error)}
                disabled={isLoading || !input.trim()}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending…
                  </>
                ) : (
                  "Send"
                )}
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{input.length} characters</span>
            {lastTranscript ? (
              <span className="truncate sm:max-w-[320px]">
                Latest voice input: {latestTranscriptPreview || "—"}
              </span>
            ) : (
              <span aria-hidden="true"> </span>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Tap the microphone to dictate, then refine or send your message.
        </p>
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
            return <div className="hidden" />
          }}
        />
      </CardFooter>
    </Card>
  )
}
