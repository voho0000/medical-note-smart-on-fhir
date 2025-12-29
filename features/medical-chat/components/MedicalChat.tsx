// Refactored Medical Chat Component
"use client"

import { useCallback } from "react"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { useNote } from "@/src/application/providers/note.provider"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useChatMessages } from "../hooks/useChatMessages"
import { useVoiceRecording } from "../hooks/useVoiceRecording"
import { useTemplateSelector } from "../hooks/useTemplateSelector"
import { useChatInput } from "../hooks/useChatInput"
import { useSystemPrompt } from "../hooks/useSystemPrompt"
import { useRecordingStatus } from "../hooks/useRecordingStatus"
import { ChatHeader } from "./ChatHeader"
import { ChatMessageList } from "./ChatMessageList"
import { ChatToolbar } from "./ChatToolbar"
import { VoiceRecorder } from "./VoiceRecorder"

export function MedicalChat() {
  const { t } = useLanguage()
  const { model } = useNote()
  const { systemPrompt, clinicalContext } = useSystemPrompt()
  const input = useChatInput()
  const chat = useChatMessages(systemPrompt, model)
  const voice = useVoiceRecording()
  const template = useTemplateSelector()
  const recordingStatus = useRecordingStatus(voice)

  // Handlers
  const handleSend = useCallback(async () => {
    const trimmed = input.input.trim()
    if (!trimmed) return
    await chat.handleSend(trimmed)
    input.clear()
  }, [input, chat])

  const handleInsertContext = useCallback(() => {
    input.insertText(clinicalContext)
  }, [input, clinicalContext])

  const handleInsertAsr = useCallback(() => {
    if (voice.asrText) input.insertText(voice.asrText)
  }, [input, voice.asrText])

  const handleInsertTemplate = useCallback(() => {
    const templateContent = template.selectedTemplate?.content?.trim()
    if (templateContent) input.insertTextWithTrim(templateContent)
  }, [input, template.selectedTemplate])

  const handleRecordingStart = useCallback(() => {
    voice.setIsRecording(true)
    voice.startTimer()
  }, [voice])

  const handleRecordingStop = useCallback(
    async (blob: Blob) => {
      voice.setIsRecording(false)
      voice.stopTimer()
      const text = await voice.handleWhisperRequest(blob)
      if (text) {
        input.setInput((prev: string) => 
          prev.trim().length > 0 ? `${prev.trimEnd()}\n\n${text}` : text
        )
      }
    },
    [voice, input]
  )

  return (
    <Card className="flex h-full flex-col">
      <ChatHeader
        recordingStatus={recordingStatus.recordingStatusLabel}
        asrError={voice.asrError}
        chatError={chat.error}
        isRecording={voice.isRecording}
        isAsrLoading={voice.isAsrLoading}
      />
      
      <CardContent className="border-t p-0">
        <ChatMessageList messages={chat.messages} isLoading={chat.isLoading} />
      </CardContent>

      <CardFooter className="flex flex-col gap-2 border-t pt-1">
        <div className="flex w-full flex-col gap-2">
          <ChatToolbar
            onInsertContext={handleInsertContext}
            onInsertAsr={handleInsertAsr}
            onClearAsr={voice.handleClearHistory}
            onResetChat={chat.handleReset}
            onInsertTemplate={handleInsertTemplate}
            hasAsrText={!!voice.asrText}
            hasChatMessages={chat.messages.length > 0}
            templates={template.templates}
            selectedTemplateId={template.selectedTemplate?.id}
            onTemplateChange={template.setSelectedTemplateId}
            hasTemplateContent={!!template.selectedTemplate?.content?.trim()}
          />

          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-end">
            <textarea
              value={input.input}
              onChange={(event) => input.setInput(event.target.value)}
              onKeyDown={(e) => input.handleKeyDown(e, handleSend)}
              placeholder={t.chat.placeholder}
              spellCheck={false}
              className="h-[72px] w-full flex-1 resize-none overflow-y-auto rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <div className="flex items-stretch gap-2 self-end sm:flex-col">
              <VoiceRecorder
                isRecording={voice.isRecording}
                isLoading={voice.isAsrLoading}
                onToggleRecording={voice.toggleRecording}
                onRecordingStart={handleRecordingStart}
                onRecordingStop={handleRecordingStop}
                startRecordingRef={voice.startRecordingRef}
                stopRecordingRef={voice.stopRecordingRef}
              />
              <button
                onClick={() => handleSend().catch(console.error)}
                disabled={chat.isLoading || !input.input.trim()}
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
              >
                {chat.isLoading ? (
                  <>
                    <svg className="mr-2 h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {t.common.sending}
                  </>
                ) : (
                  t.common.send
                )}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{input.input.length} {t.chat.characters}</span>
            {voice.lastTranscript ? (
              <span className="truncate sm:max-w-[320px]">
                {t.chat.latestVoiceInput} {recordingStatus.latestTranscriptPreview || "—"}
              </span>
            ) : (
              <span aria-hidden="true"> </span>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {t.chat.microphoneHint}
        </p>
      </CardFooter>
    </Card>
  )
}
