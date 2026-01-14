// Refactored Medical Chat Component
"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AlertCircle, Maximize2 } from "lucide-react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useAuth } from "@/src/application/providers/auth.provider"
import { useModel, useAiConfigStore } from "@/src/application/stores/ai-config.store"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { ChatMessageList } from "./ChatMessageList"
import { ChatHeader } from "./ChatHeader"
import { ChatToolbar } from "./ChatToolbar"
import { ChatModeSelector } from "./ChatModeSelector"
import { ChatInputArea } from "./ChatInputArea"
import { ExpandedOverlay } from '@/src/shared/components/ExpandedOverlay'
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
import { useTextareaAutoResize } from "../hooks/useTextareaAutoResize"
import { useApiKeyValidation } from "../hooks/useApiKeyValidation"
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts"

export default function MedicalChat() {
  const { t } = useLanguage()
  const { user } = useAuth()
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
  
  // Header visibility state (default collapsed for more chat space)
  const [showHeader, setShowHeader] = useState(false)
  
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

  // API key validation
  const { hasApiKey } = useApiKeyValidation(model, openAiKey, geminiKey)

  // Hide warning when API key is set or user is logged in
  useEffect(() => {
    if (isAgentMode && (hasApiKey() || !!user)) {
      agentMode.hideWarning()
    }
  }, [isAgentMode, hasApiKey, !!user, agentMode])

  // Handle agent mode toggle with API key check
  const handleAgentModeToggle = useCallback((enabled: boolean) => {
    // Only show warning if user is not logged in and has no API key
    if (enabled && !hasApiKey() && !user) {
      agentMode.showWarning()
    } else {
      agentMode.hideWarning()
    }
    agentMode.setIsAgentMode(enabled)
  }, [hasApiKey, user, agentMode])

  // Handlers
  const handleSend = useCallback(async () => {
    const trimmed = input.input.trim()
    if (!trimmed) return
    await chat.handleSend(trimmed)
  }, [input, chat])
  
  // Auto-resize textarea
  useTextareaAutoResize(textareaRef, input.input)

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

  // Keyboard shortcuts
  useKeyboardShortcuts(isExpanded, expandable.collapse)

  const chatContent = (
    <Card className={`flex h-full flex-col overflow-hidden ${isExpanded ? 'rounded-none border-0' : ''} !gap-0 !py-0`}>
      {!isExpanded && (
        <div className="flex items-center gap-1 px-2 py-1">
          <button
            onClick={() => setShowHeader(!showHeader)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            title={showHeader ? t.chat.hideHeader : t.chat.showHeader}
          >
            {showHeader ? `▲ ${t.chat.hideHeader}` : `▼ ${t.chat.showHeader}`}
          </button>
          <button
            onClick={expandable.toggle}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 ml-auto"
            title={t.common.maximize}
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      )}
      {!isExpanded && showHeader && (
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
        />
      )}
      
      <CardContent className={`flex-1 p-0 overflow-y-auto min-h-0 bg-gradient-to-b from-muted/20 to-background ${isExpanded || !showHeader ? '' : 'border-t'}`}>
        <ChatMessageList messages={chatMessages} isLoading={chat.isLoading} />
      </CardContent>

      <CardFooter className="flex flex-col gap-2 border-t pt-1 shrink-0">
        <div className="flex w-full flex-col gap-2">
          <div className="flex items-center gap-1 overflow-x-auto">
            <ChatModeSelector
              isAgentMode={isAgentMode}
              showApiKeyWarning={showApiKeyWarning}
              onModeToggle={handleAgentModeToggle}
            />
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
          <ChatInputArea
            input={input}
            textareaRef={textareaRef}
            isLoading={chat.isLoading}
            onSend={handleSend}
            onStopGeneration={() => chat.stopGeneration()}
            voice={voice}
          />
        </div>
      </CardFooter>
    </Card>
  )

  // Render expanded overlay or normal view
  if (isExpanded) {
    return (
      <ExpandedOverlay
        content={chatContent}
        onCollapse={expandable.collapse}
        placeholderText={t.chat.expandedMode}
      />
    )
  }

  return chatContent
}
