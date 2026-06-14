// Refactored Medical Chat Component
"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { AlertCircle, Maximize2, MessageSquareDashed, SquarePen, X } from "lucide-react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useAuth } from "@/src/application/providers/auth.provider"
import { useModel, useAiConfigStore } from "@/src/application/stores/ai-config.store"
import {
  useChatStore,
  useIsTemporaryMode,
  useSetIsTemporaryMode,
  useSetChatMessages,
} from "@/src/application/stores/chat.store"
import { useSetCurrentSessionId } from "@/src/application/stores/chat-history.store"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
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
import { AuthDialog } from "@/features/auth"
import { getModelDefinition } from "@/src/shared/constants/ai-models.constants"

export default function MedicalChat() {
  const { t } = useLanguage()
  const { user } = useAuth()
  const model = useModel()
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
  
  // Check if current model supports agent mode
  const currentModelDef = getModelDefinition(model)
  const isAgentModeDisabled = currentModelDef?.disableAgentMode || false
  
  // Auto-disable agent mode when switching to unsupported model
  useEffect(() => {
    if (isAgentModeDisabled && isAgentMode) {
      agentMode.setIsAgentMode(false)
    }
  }, [isAgentModeDisabled, isAgentMode, agentMode])
  
  // Expand/collapse state (independent UI state)
  const expandable = useExpandable()
  const { isExpanded } = expandable
  
  // Header visibility state (default collapsed for more chat space)
  const [showHeader, setShowHeader] = useState(false)
  
  // Prompt Gallery state
  const [showPromptGallery, setShowPromptGallery] = useState(false)
  
  // Auth Dialog state
  const [showAuthDialog, setShowAuthDialog] = useState(false)

  // New-conversation confirm — only shown when the current chat would be lost
  const [showNewChatConfirm, setShowNewChatConfirm] = useState(false)
  
  // FHIR context for chat history (patient ID and server URL)
  const { patientId, fhirServerUrl } = useFhirContext()
  
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

  // Temporary / incognito chat mode (ChatGPT-style)
  const isTemporaryMode = useIsTemporaryMode()
  const setIsTemporaryMode = useSetIsTemporaryMode()
  const setMessagesGlobal = useSetChatMessages()
  const setCurrentSessionId = useSetCurrentSessionId()

  const handleToggleTemporaryMode = useCallback(async () => {
    if (!isTemporaryMode) {
      // Entering: save the current chat (if any) before clearing.
      try {
        await forceSave()
      } catch {
        // Best-effort save; even if it fails we still enter temp mode.
      }
      setMessagesGlobal([])
      setCurrentSessionId(null)
      setIsTemporaryMode(true)
    } else {
      // Exiting: discard the in-memory temporary conversation.
      setMessagesGlobal([])
      setCurrentSessionId(null)
      setIsTemporaryMode(false)
    }
  }, [isTemporaryMode, forceSave, setMessagesGlobal, setCurrentSessionId, setIsTemporaryMode])

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

  // Start a new conversation. Logged-in (non-temp) chats are already auto-saved
  // to history, so we persist + start fresh silently; signed-out / temp-mode
  // chats would be lost, so confirm first.
  const handleNewConversation = useCallback(async () => {
    if (chatMessages.length === 0) {
      chat.handleReset()
      return
    }
    if (user && !isTemporaryMode) {
      try {
        await forceSave()
      } catch {
        // Best-effort save; still start the new chat.
      }
      chat.handleReset()
      toast.success(t.chat.newChatSavedToast)
      return
    }
    setShowNewChatConfirm(true)
  }, [chatMessages.length, user, isTemporaryMode, forceSave, chat, t])

  const confirmNewConversation = useCallback(() => {
    setShowNewChatConfirm(false)
    chat.handleReset()
  }, [chat])
  
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
    
    // Clear input and reset height immediately after sending
    clearInputAndResetHeight()
    
    // Clear images after successful send
    clearImagesAfterSend()
    
    // Pass images to chat handler (this will add user message to state)
    // Note: handleSend is async and will start streaming, but user message is added to state immediately
    const sendPromise = chat.handleSend(messageToSend, chatImages)
    
    // Stage 1: Save user message immediately after it's added to state (prevent data loss)
    // This ensures user input is never lost even if AI response fails or gets interrupted
    // Use queueMicrotask to ensure state update has been processed
    queueMicrotask(async () => {
      try {
        await forceSave()
      } catch (error) {
        console.error('[Chat] Failed to save user message:', error)
      }
    })
    
    // Wait for AI response to complete
    await sendPromise
    // Stage 2: AI response completion will trigger another forceSave to update with full conversation
  }, [input, imageUpload.images, chat, getFullClinicalContext, chatMessages.length, clearImagesAfterSend, clearInputAndResetHeight, forceSave])
  
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
          <div className="flex items-center gap-1">
            {/* Keep the history drawer visible even when signed out — its
                internal empty-state shows a "sign in to save chats" CTA,
                which is how users discover the feature exists. The temp-
                mode toggle, on the other hand, is a "don't save" switch
                that makes no sense when we weren't saving in the first
                place, so hide it for signed-out users. */}
            <ChatHistoryDrawer />
            {user && (
              <button
                onClick={handleToggleTemporaryMode}
                className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs transition-colors ${
                  isTemporaryMode
                    ? 'border-purple-300 bg-purple-100 text-purple-700 hover:bg-purple-200 dark:border-purple-800 dark:bg-purple-950/50 dark:text-purple-300'
                    : 'bg-background text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
                title={
                  isTemporaryMode
                    ? ((t.chat as any).temporaryModeExit ?? '結束無痕對話')
                    : ((t.chat as any).temporaryModeEnter ?? '開啟無痕對話')
                }
              >
                <MessageSquareDashed className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">
                  {isTemporaryMode
                    ? ((t.chat as any).temporaryModeActive ?? '無痕中')
                    : ((t.chat as any).temporaryModeLabel ?? '無痕')}
                </span>
              </button>
            )}
          </div>
          <button
            onClick={() => setShowHeader(!showHeader)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors absolute left-1/2 -translate-x-1/2"
            title={showHeader ? t.chat.hideHeader : t.chat.showHeader}
          >
            {showHeader ? `▲ ${t.chat.hideHeader}` : `▼ ${t.chat.showHeader}`}
          </button>
          <div className="flex items-center gap-1">
            <button
              onClick={handleNewConversation}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-primary/40 px-2 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
              title={t.chat.newChat}
            >
              <SquarePen className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t.chat.newChat}</span>
            </button>
            <button
              onClick={expandable.toggle}
              className="text-muted-foreground hover:text-foreground transition-colors p-1"
              title={t.common.maximize}
            >
              <Maximize2 className="h-4 w-4" />
            </button>
          </div>
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

      <CardFooter className="flex flex-col gap-2 border-t px-3 sm:px-6 !pt-2 pb-2 shrink-0">
        <div className="flex w-full flex-col gap-1">
          {/* Single row; the neutral, condensed toolbar fits one line on phones.
              overflow-x-auto is only a safety net for very narrow (<360px) devices. */}
          <div className="flex items-center gap-1 overflow-x-auto">
            <ChatModeSelector
              isAgentMode={isAgentMode}
              showApiKeyWarning={showApiKeyWarning}
              onModeToggle={handleAgentModeToggle}
              disabled={isAgentModeDisabled}
              disabledReason={isAgentModeDisabled ? t.medicalChat.agentModeDisabledForModel : undefined}
            />
            <ChatToolbar
              onInsertContext={handleInsertContext}
              onInsertTemplate={handleInsertTemplate}
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
                <div className="text-amber-700 dark:text-amber-300">
                  {t.medicalChat.apiKeyWarningMessage.split(t.medicalChat.loginLink).map((part, index, array) => (
                    index < array.length - 1 ? (
                      <span key={index}>
                        {part}
                        <button
                          onClick={() => setShowAuthDialog(true)}
                          className="underline hover:text-amber-900 dark:hover:text-amber-100 font-medium"
                        >
                          {t.medicalChat.loginLink}
                        </button>
                      </span>
                    ) : part
                  ))}
                </div>
              </div>
            </div>
          )}
          {isTemporaryMode && user && (
            <div className="flex items-center justify-between gap-2 rounded-md border border-purple-200 bg-purple-50/70 px-3 py-1.5 text-xs text-purple-700 dark:border-purple-900 dark:bg-purple-950/40 dark:text-purple-300">
              <span className="inline-flex items-center gap-1.5">
                <MessageSquareDashed className="h-3.5 w-3.5" />
                {(t.chat as any).temporaryModeBanner ?? '無痕對話 · 此對話不會被儲存'}
              </span>
              <button
                onClick={handleToggleTemporaryMode}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-purple-100 dark:hover:bg-purple-900"
                title={(t.chat as any).temporaryModeExit ?? '結束無痕對話'}
              >
                <X className="h-3 w-3" />
                {(t.chat as any).temporaryModeExitShort ?? '結束'}
              </button>
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

  const newChatConfirmDialog = (
    <AlertDialog open={showNewChatConfirm} onOpenChange={setShowNewChatConfirm}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t.chat.newChatConfirmTitle}</AlertDialogTitle>
          <AlertDialogDescription>{t.chat.newChatConfirmDescription}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={confirmNewConversation}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {t.chat.newChat}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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
        <AuthDialog
          open={showAuthDialog}
          onOpenChange={setShowAuthDialog}
        />
        {newChatConfirmDialog}
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
      <AuthDialog
        open={showAuthDialog}
        onOpenChange={setShowAuthDialog}
      />
      {newChatConfirmDialog}
    </>
  )
}
