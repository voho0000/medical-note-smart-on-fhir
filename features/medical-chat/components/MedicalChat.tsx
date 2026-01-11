// Refactored Medical Chat Component
"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useModel, useAiConfigStore } from "@/src/stores/ai-config.store"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { ChatMessageList } from "./ChatMessageList"
import { VoiceRecorder } from "./VoiceRecorder"
import { ChatHeader } from "./ChatHeader"
import { ChatToolbar } from "./ChatToolbar"
import { useStreamingChat } from "../hooks/useStreamingChat"
import { useAgentChat } from "../hooks/useAgentChat"
import { useVoiceRecording } from "../hooks/useVoiceRecording"
import { useTemplateSelector } from "../hooks/useTemplateSelector"
import { useChatInput } from "../hooks/useChatInput"
import { useSystemPrompt } from "../hooks/useSystemPrompt"
import { useRecordingStatus } from "../hooks/useRecordingStatus"
import { useAgentMode } from "../hooks/useAgentMode"
import { useExpandable } from "@/src/shared/hooks/ui/use-expandable.hook"
import { useClinicalContext } from "@/src/application/hooks/use-clinical-context.hook"
import { getModelDefinition } from "@/src/shared/constants/ai-models.constants"
import { Sparkles, MessageSquare, Square, AlertCircle, Maximize2, Minimize2 } from "lucide-react"

export default function MedicalChat() {
  const { t } = useLanguage()
  const model = useModel()
  const setModel = useAiConfigStore((state) => state.setModel)
  const openAiKey = useAiConfigStore((state) => state.apiKey)
  const geminiKey = useAiConfigStore((state) => state.geminiKey)
  const { systemPrompt, updateSystemPrompt, resetSystemPrompt, isCustomPrompt } = useSystemPrompt()
  const { getFullClinicalContext } = useClinicalContext()
  const input = useChatInput()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  
  // Agent mode state (logically related: agent mode + API key warning)
  const agentMode = useAgentMode()
  const { isAgentMode, showApiKeyWarning } = agentMode
  
  // Expand/collapse state (independent UI state)
  const expandable = useExpandable()
  const { isExpanded } = expandable
  
  // Clear input and reset textarea height
  const clearInputAndResetHeight = useCallback(() => {
    input.clear()
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [input])
  
  const normalChat = useStreamingChat(systemPrompt, model, clearInputAndResetHeight)
  const agentChat = useAgentChat(systemPrompt, model, clearInputAndResetHeight)
  const chat = isAgentMode ? agentChat : normalChat
  
  // Ensure chat.messages is always an array
  const chatMessages = Array.isArray(chat.messages) ? chat.messages : []
  const template = useTemplateSelector()
  
  // Voice recording with callback to insert transcript into input
  const handleTranscriptReady = useCallback((text: string) => {
    input.setInput((prev: string) => 
      prev.trim().length > 0 ? `${prev.trimEnd()}\n\n${text}` : text
    )
    if (textareaRef.current) {
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.scrollTop = textareaRef.current.scrollHeight
        }
      }, 0)
    }
  }, [input])
  
  const voice = useVoiceRecording(handleTranscriptReady)
  const recordingStatus = useRecordingStatus(voice)

  // Check if current model has API key
  const hasApiKey = useCallback(() => {
    const modelDef = getModelDefinition(model)
    const provider = modelDef?.provider ?? "openai"
    return provider === "openai" ? !!openAiKey : !!geminiKey
  }, [model, openAiKey, geminiKey])

  // Hide warning when API key is set
  useEffect(() => {
    if (isAgentMode && hasApiKey()) {
      agentMode.hideWarning()
    }
  }, [isAgentMode, hasApiKey, agentMode])

  // Handle agent mode toggle with API key check
  const handleAgentModeToggle = useCallback((enabled: boolean) => {
    if (enabled && !hasApiKey()) {
      agentMode.showWarning()
    } else {
      agentMode.hideWarning()
    }
    agentMode.setIsAgentMode(enabled)
  }, [hasApiKey, agentMode])

  // Handlers
  const handleSend = useCallback(async () => {
    const trimmed = input.input.trim()
    if (!trimmed) return
    await chat.handleSend(trimmed)
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

  const handleInsertTemplate = useCallback(() => {
    const templateContent = template.selectedTemplate?.content?.trim()
    if (templateContent) {
      input.insertTextWithTrim(templateContent)
      scrollTextareaToBottom()
    }
  }, [input, template.selectedTemplate, scrollTextareaToBottom])

  // Handle escape key to close expanded mode
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isExpanded) {
        expandable.collapse()
      }
    }
    
    if (isExpanded) {
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
    }
    
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [isExpanded])

  const chatContent = (
    <Card className={`flex h-full flex-col overflow-hidden ${isExpanded ? 'rounded-none border-0' : ''}`}>
      {!isExpanded && (
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
          isExpanded={isExpanded}
          onToggleExpand={expandable.toggle}
        />
      )}
      
      <CardContent className={`flex-1 p-0 overflow-y-auto min-h-0 bg-gradient-to-b from-muted/20 to-background ${isExpanded ? '' : 'border-t'}`}>
        <ChatMessageList messages={chatMessages} isLoading={chat.isLoading} />
      </CardContent>

      <CardFooter className="flex flex-col gap-2 border-t pt-1 shrink-0">
        <div className="flex w-full flex-col gap-2">
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => handleAgentModeToggle(false)}
                className={`flex items-center gap-1 rounded-md px-2 py-1 transition-colors ${
                  !isAgentMode
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                {t.medicalChat.normalMode}
              </button>
              <button
                type="button"
                onClick={() => handleAgentModeToggle(true)}
                className={`flex items-center gap-1 rounded-md px-2 py-1 transition-colors ${
                  isAgentMode
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                <Sparkles className="h-3.5 w-3.5" />
                {t.medicalChat.deepMode}
              </button>
            </div>
            {isAgentMode && (
              <span className="text-[10px] text-muted-foreground/60">
                {t.medicalChat.agentModeDescription}
              </span>
            )}
          </div>
          {showApiKeyWarning && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs">
              <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1 text-amber-800 dark:text-amber-200">
                <div className="font-medium mb-1">{t.medicalChat.apiKeyWarningTitle}</div>
                <div className="text-amber-700 dark:text-amber-300">{t.medicalChat.apiKeyWarningMessage}</div>
              </div>
            </div>
          )}
          <ChatToolbar
            onInsertContext={handleInsertContext}
            onResetChat={chat.handleReset}
            onInsertTemplate={handleInsertTemplate}
            hasChatMessages={chatMessages.length > 0}
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
                onKeyDown={(e) => input.handleKeyDown(e, handleSend, chat.isLoading)}
                placeholder={t.chat.placeholder}
                spellCheck={false}
                rows={1}
                className="w-full resize-none overflow-y-auto rounded-xl border-2 border-input bg-background/50 px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:border-blue-500 focus-visible:ring-4 focus-visible:ring-blue-500/10 focus-visible:shadow-lg focus-visible:bg-background hover:border-input/80 hover:bg-background disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200"
                style={{ minHeight: '44px', maxHeight: '200px' }}
              />
            </div>
            <VoiceRecorder
              isRecording={voice.isRecording}
              isLoading={voice.isAsrLoading}
              onToggleRecording={voice.toggleRecording}
              onRecordingStart={voice.onRecordingStart}
              onRecordingStop={voice.onRecordingStop}
              startRecordingRef={voice.startRecordingRef}
              stopRecordingRef={voice.stopRecordingRef}
            />
            {chat.isLoading ? (
              <button
                onClick={() => chat.stopGeneration()}
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 h-10 px-4 py-2"
              >
                <Square className="h-4 w-4 fill-current" />
                {t.common.stop}
              </button>
            ) : (
              <button
                onClick={() => handleSend().catch(console.error)}
                disabled={!input.input.trim() || chat.isLoading}
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
              >
                {t.common.send}
              </button>
            )}
          </div>
          {input.input.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground/60">
              <span>{input.input.length} {t.chat.characters}</span>
            </div>
          )}
        </div>
      </CardFooter>
    </Card>
  )

  // Render expanded overlay or normal view
  if (isExpanded) {
    return (
      <>
        {/* Placeholder to maintain layout */}
        <Card className="flex h-full flex-col overflow-hidden opacity-50">
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <Maximize2 className="h-8 w-8 mr-2" />
            {t.chat.expandedMode}
          </div>
        </Card>
        
        {/* Fullscreen overlay - click outside to close */}
        <div 
          className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col"
          onClick={expandable.collapse}
        >
          {/* Floating minimize button */}
          <button
            onClick={expandable.collapse}
            className="absolute top-4 right-4 z-10 p-2 rounded-full bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shadow-md"
            title={t.common.minimize}
          >
            <Minimize2 className="h-5 w-5" />
          </button>
          
          <div 
            className="flex-1 w-full max-w-5xl mx-auto p-4 sm:p-6 flex flex-col min-h-0"
            onClick={(e) => e.stopPropagation()}
          >
            {chatContent}
          </div>
        </div>
      </>
    )
  }

  return chatContent
}
