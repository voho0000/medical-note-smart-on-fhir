// Refactored Medical Chat Component
"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AlertCircle, Maximize2 } from "lucide-react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useAuth } from "@/src/application/providers/auth.provider"
import { useModel, useAiConfigStore } from "@/src/application/stores/ai-config.store"
import { useChatStore } from "@/src/application/stores/chat.store"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { CARD_BORDER_CLASSES } from "@/src/shared/config/ui-theme.config"
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
import { useImageUpload } from "../hooks/useImageUpload"
import { useRecordingStatus } from "../hooks/useRecordingStatus"
import { fileToBase64 } from "@/src/shared/utils/file-to-base64.utils"
import type { ChatImage } from "@/src/application/stores/chat.store"
import { useAgentMode } from "../hooks/useAgentMode"
import { useExpandable } from "@/src/shared/hooks/ui/use-expandable.hook"
import { useClinicalContext } from "@/src/application/hooks/use-clinical-context.hook"
import { useTextareaAutoResize } from "../hooks/useTextareaAutoResize"
import { useApiKeyValidation } from "../hooks/useApiKeyValidation"
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts"
import { useFhirContext } from "@/src/application/hooks/chat/use-fhir-context.hook"
import { useAutoSaveChat } from "@/src/application/hooks/chat/use-auto-save-chat.hook"
import { useSmartTitleGeneration } from "@/src/application/hooks/chat/use-smart-title-generation.hook"
import { ChatHistoryDrawer } from "@/features/chat-history"
import { usePatient } from "@/src/application/hooks/patient/use-patient-query.hook"
import { useClinicalData } from "@/src/application/hooks/clinical-data/use-clinical-data-query.hook"
import { PromptGalleryDialog } from "@/features/prompt-gallery"
import type { SharedPrompt } from "@/features/prompt-gallery"
import { useChatTemplates } from "@/src/application/providers/chat-templates.provider"

export default function MedicalChat() {
  const { t } = useLanguage()
  const { user } = useAuth()
  const model = useModel()
  const setModel = useAiConfigStore((state) => state.setModel)
  const openAiKey = useAiConfigStore((state) => state.apiKey)
  const geminiKey = useAiConfigStore((state) => state.geminiKey)
  const { systemPrompt, updateSystemPrompt, resetSystemPrompt, isCustomPrompt } = useSystemPrompt()
  const { getFullClinicalContext } = useClinicalContext()
  const { addTemplate, updateTemplate, saveTemplates, maxTemplates, templates } = useChatTemplates()
  const input = useChatInput()
  const imageUpload = useImageUpload()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  
  // Agent mode state (logically related: agent mode + API key warning)
  const agentMode = useAgentMode()
  const { isAgentMode, showApiKeyWarning } = agentMode
  
  // Expand/collapse state (independent UI state)
  const expandable = useExpandable()
  const { isExpanded } = expandable
  
  // Header visibility state (default collapsed for more chat space)
  const [showHeader, setShowHeader] = useState(false)
  
  // Prompt Gallery state
  const [showPromptGallery, setShowPromptGallery] = useState(false)
  
  // FHIR context for chat history (patient ID and server URL)
  const { patientId, patientName, fhirServerUrl } = useFhirContext()
  
  // FHIR error handling
  const { error: patientError } = usePatient()
  const { error: clinicalDataError, isLoading: isLoadingClinicalData } = useClinicalData()
  
  // Auto-save chat to Firestore (debounced)
  // Note: patientName is only used for UI display, never stored in Firestore
  // Auto-save is enabled when user is logged in, even without FHIR data
  const { forceSave } = useAutoSaveChat({
    patientId: patientId || undefined,
    fhirServerUrl: fhirServerUrl || undefined,
    debounceMs: 5000,
    enabled: !!user,
  })

  // AI smart title generation (after first response)
  useSmartTitleGeneration()

  // Clear input and reset textarea height
  const clearInputAndResetHeight = useCallback(() => {
    input.clear()
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [input])
  
  const normalChat = useStreamingChat(systemPrompt, model, clearInputAndResetHeight, forceSave)
  const agentChat = useAgentChat(systemPrompt, model, clearInputAndResetHeight, forceSave)
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

  // Show/hide warning based on API key status and login status
  // Logged-in users can use Firebase Proxy, so they don't need API key
  const apiKeyAvailable = hasApiKey()
  useEffect(() => {
    if (isAgentMode && !apiKeyAvailable && !user) {
      agentMode.showWarning()
    } else {
      agentMode.hideWarning()
    }
  }, [isAgentMode, apiKeyAvailable, user, agentMode])

  // Handle agent mode toggle with API key check
  const handleAgentModeToggle = useCallback((enabled: boolean) => {
    // Show warning only if no API key AND not logged in (logged-in users can use proxy)
    if (enabled && !hasApiKey() && !user) {
      agentMode.showWarning()
    } else {
      agentMode.hideWarning()
    }
    agentMode.setIsAgentMode(enabled)
  }, [hasApiKey, user, agentMode])

  // Clear images after sending message
  const clearImagesAfterSend = useCallback(() => {
    imageUpload.clearImages()
  }, [imageUpload])

  // Handlers
  const handleSend = useCallback(async () => {
    const trimmed = input.input.trim()
    const hasImages = imageUpload.images.length > 0
    
    // Require either text or images
    if (!trimmed && !hasImages) return
    
    // Auto-include clinical context if enabled AND this is the first message in the conversation
    // This prevents redundant context inclusion in follow-up questions
    const autoIncludeContext = useChatStore.getState().autoIncludeContext
    const isFirstMessage = chatMessages.length === 0
    let messageToSend = trimmed
    
    if (autoIncludeContext && isFirstMessage) {
      const context = getFullClinicalContext()
      if (context.trim()) {
        // Put user input first, then clinical context below
        messageToSend = `${trimmed}\n\n${context}`
      }
    }
    
    // Convert File objects to ChatImage (base64) for API
    let chatImages: ChatImage[] | undefined
    if (hasImages) {
      chatImages = await Promise.all(
        imageUpload.images.map(async (img) => ({
          data: await fileToBase64(img.file),
          mimeType: img.file.type,
          fileName: img.file.name,
          size: img.file.size,
        }))
      )
    }
    
    // Pass images to chat handler
    await chat.handleSend(messageToSend, chatImages)
    
    // Clear images after successful send
    clearImagesAfterSend()
  }, [input, imageUpload.images, chat, getFullClinicalContext, chatMessages.length, clearImagesAfterSend])
  
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

  // Handle prompt selection from gallery
  const handleSelectPrompt = useCallback((prompt: SharedPrompt, useAs?: 'chat' | 'insight') => {
    // Insert prompt content into chat input
    input.insertTextWithTrim(prompt.prompt)
    scrollTextareaToBottom()
    
    // Also add to chat templates if useAs is 'chat' or undefined
    if (useAs !== 'insight' && templates.length < maxTemplates) {
      const newTemplateId = addTemplate()
      if (newTemplateId) {
        updateTemplate(newTemplateId, {
          label: prompt.title,
          content: prompt.prompt,
        })
        
        // Auto-save to Firestore after adding template
        setTimeout(async () => {
          await saveTemplates()
        }, 200)
      }
    }
  }, [input, scrollTextareaToBottom, addTemplate, updateTemplate, saveTemplates, templates.length, maxTemplates])

  // Keyboard shortcuts
  useKeyboardShortcuts(isExpanded, expandable.collapse)

  const chatContent = (
    <Card className={`flex h-full flex-col overflow-hidden ${isExpanded ? 'rounded-none border-0' : CARD_BORDER_CLASSES.chat} !gap-0 !py-0`}>
      {!isExpanded && (
        <div className="relative flex items-center justify-between px-2 py-1">
          <ChatHistoryDrawer />
          <button
            onClick={() => setShowHeader(!showHeader)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors absolute left-1/2 -translate-x-1/2"
            title={showHeader ? t.chat.hideHeader : t.chat.showHeader}
          >
            {showHeader ? `▲ ${t.chat.hideHeader}` : `▼ ${t.chat.showHeader}`}
          </button>
          <button
            onClick={expandable.toggle}
            className="text-muted-foreground hover:text-foreground transition-colors p-1"
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
        {(patientError || clinicalDataError) && (
          <div className="mx-4 mt-4 mb-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 text-sm">
            <div className="font-medium text-amber-800 dark:text-amber-200 mb-1">{t.medicalChat.fhirDataWarning}</div>
            <div className="text-amber-700 dark:text-amber-300 text-xs">
              {patientError && <div>• {t.errors.fetchPatient}</div>}
              {clinicalDataError && <div>• {t.errors.fetchClinicalData}</div>}
              {isAgentMode && <div className="mt-1">• {t.medicalChat.deepModeLimited}</div>}
            </div>
          </div>
        )}
        <ChatMessageList messages={chatMessages} isLoading={chat.isLoading} />
      </CardContent>

      <CardFooter className="flex flex-col gap-2 border-t px-6 !pt-2 pb-2 shrink-0">
        <div className="flex w-full flex-col gap-1">
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
              onOpenGallery={() => setShowPromptGallery(true)}
              isLoadingClinicalData={isLoadingClinicalData}
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
            images={imageUpload}
            disabled={isAgentMode && !hasApiKey() && !user}
          />
        </div>
      </CardFooter>
    </Card>
  )

  // Render expanded overlay or normal view
  if (isExpanded) {
    return (
      <>
        <ExpandedOverlay
          content={chatContent}
          onCollapse={expandable.collapse}
          placeholderText={t.chat.expandedMode}
        />
        <PromptGalleryDialog
          open={showPromptGallery}
          onOpenChange={setShowPromptGallery}
          mode="chat"
          onSelectPrompt={handleSelectPrompt}
        />
      </>
    )
  }

  return (
    <>
      {chatContent}
      <PromptGalleryDialog
        open={showPromptGallery}
        onOpenChange={setShowPromptGallery}
        mode="chat"
        onSelectPrompt={handleSelectPrompt}
      />
    </>
  )
}
