// Refactored Medical Chat Component
"use client"

import { useCallback, useEffect, useRef } from "react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useNote } from "@/src/application/providers/note.provider"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { ChatMessageList } from "./ChatMessageList"
import { VoiceRecorder } from "./VoiceRecorder"
import { ChatHeader } from "./ChatHeader"
import { ChatToolbar } from "./ChatToolbar"
import { useChatMessages } from "../hooks/useChatMessages"
import { useVoiceRecording } from "../hooks/useVoiceRecording"
import { useTemplateSelector } from "../hooks/useTemplateSelector"
import { useChatInput } from "../hooks/useChatInput"
import { useSystemPrompt } from "../hooks/useSystemPrompt"
import { useRecordingStatus } from "../hooks/useRecordingStatus"
import { useClinicalContext } from "@/src/application/hooks/use-clinical-context.hook"

export function MedicalChat() {
  const { t } = useLanguage()
  const { model } = useNote()
  const { systemPrompt, updateSystemPrompt, resetSystemPrompt, isCustomPrompt } = useSystemPrompt()
  const { getFullClinicalContext } = useClinicalContext()
  const input = useChatInput()
  const chat = useChatMessages(systemPrompt, model)
  const voice = useVoiceRecording()
  const template = useTemplateSelector()
  const recordingStatus = useRecordingStatus(voice)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Handlers
  const handleSend = useCallback(async () => {
    const trimmed = input.input.trim()
    if (!trimmed) return
    await chat.handleSend(trimmed)
    input.clear()
    // Reset textarea height after sending
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [input, chat])
  
  // Auto-resize textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    
    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = 'auto'
    
    // Calculate new height with min and max constraints
    const minHeight = 40 // Single line height
    const maxHeight = 200 // Maximum height (about 8 lines)
    const newHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight)
    
    textarea.style.height = `${newHeight}px`
  }, [input.input])

  const scrollTextareaToBottom = useCallback(() => {
    if (textareaRef.current) {
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.scrollTop = textareaRef.current.scrollHeight
        }
      }, 0)
    }
  }, [])

  const handleInsertContext = useCallback(() => {
    input.insertText(getFullClinicalContext())
    scrollTextareaToBottom()
  }, [input, getFullClinicalContext, scrollTextareaToBottom])

  const handleInsertAsr = useCallback(() => {
    if (voice.asrText) {
      input.insertText(voice.asrText)
      scrollTextareaToBottom()
    }
  }, [input, voice.asrText, scrollTextareaToBottom])

  const handleInsertTemplate = useCallback(() => {
    const templateContent = template.selectedTemplate?.content?.trim()
    if (templateContent) {
      input.insertTextWithTrim(templateContent)
      scrollTextareaToBottom()
    }
  }, [input, template.selectedTemplate, scrollTextareaToBottom])

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
        scrollTextareaToBottom()
      }
    },
    [voice, input, scrollTextareaToBottom]
  )

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <ChatHeader
        recordingStatus={recordingStatus.recordingStatusLabel}
        asrError={voice.asrError}
        chatError={chat.error}
        isRecording={voice.isRecording}
        isAsrLoading={voice.isAsrLoading}
        systemPrompt={systemPrompt}
        onUpdateSystemPrompt={updateSystemPrompt}
        onResetSystemPrompt={resetSystemPrompt}
        isCustomPrompt={isCustomPrompt}
      />
      
      <CardContent className="flex-1 border-t p-0 overflow-y-auto min-h-0">
        <ChatMessageList messages={chat.messages} isLoading={chat.isLoading} />
      </CardContent>

      <CardFooter className="flex flex-col gap-2 border-t pt-1 shrink-0">
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

          <div className="flex w-full gap-2 items-end">
            <div className="flex-1 flex flex-col justify-end">
              <textarea
                ref={textareaRef}
                value={input.input}
                onChange={(event) => input.setInput(event.target.value)}
                onKeyDown={(e) => input.handleKeyDown(e, handleSend)}
                placeholder={t.chat.placeholder}
                spellCheck={false}
                rows={1}
                className="w-full resize-none overflow-y-auto rounded-lg border border-input/60 bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-primary/20 focus-visible:ring-4 focus-visible:shadow-md hover:border-border disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200"
                style={{ minHeight: '40px', maxHeight: '200px' }}
              />
            </div>
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
          {(input.input.length > 0 || voice.lastTranscript) && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground/60">
              {input.input.length > 0 && (
                <span>{input.input.length} {t.chat.characters}</span>
              )}
              {voice.lastTranscript && (
                <span className="truncate sm:max-w-[320px] ml-auto">
                  {t.chat.latestVoiceInput} {recordingStatus.latestTranscriptPreview || "—"}
                </span>
              )}
            </div>
          )}
        </div>
      </CardFooter>
    </Card>
  )
}
