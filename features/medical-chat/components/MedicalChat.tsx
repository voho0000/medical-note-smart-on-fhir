// Refactored Medical Chat Component
"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { AlertCircle, Info, Maximize2, MessageSquareDashed, SquarePen, X } from "lucide-react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useAuth } from "@/src/application/providers/auth.provider"
import { useAiConfigStore } from "@/src/application/stores/ai-config.store"
import { useEffectiveModel, useModelPref, useSetModelFor, MODEL_PREF_DEFAULTS } from "@/src/application/stores/model-prefs.store"
import { ModelPicker } from "@/src/shared/components/ModelPicker"
import {
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
import { ChatTemplatesManagerDrawer } from "./ChatTemplatesManagerDrawer"
import { ChatInputArea } from "./ChatInputArea"
import { SuggestionChips } from "./SuggestionChips"
import { ExpandedOverlay } from '@/src/shared/components/ExpandedOverlay'
import { useAgentChat } from "../hooks/useAgentChat"
import { useFollowupSuggestions } from "../hooks/useFollowupSuggestions"
import { useVoiceRecording } from "../hooks/useVoiceRecording"
import { useTemplateSelector } from "../hooks/useTemplateSelector"
import { useChatInput } from "../hooks/useChatInput"
import { useSystemPrompt } from "../hooks/useSystemPrompt"
import { useImageUpload } from "../hooks/useImageUpload"
import { useRecordingStatus } from "../hooks/useRecordingStatus"
import { fileToBase64 } from "@/src/shared/utils/file-to-base64.utils"
import type { ChatImage, ChatReplyReference } from "@/src/application/stores/chat.store"
import { useExpandable } from "@/src/shared/hooks/ui/use-expandable.hook"
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
import type { PromptType, SharedPrompt } from "@/features/prompt-gallery"
import { useChatTemplates } from "@/src/application/providers/chat-templates.provider"
import { AuthDialog } from "@/features/auth"
import { isQuotaExceededError } from "@/src/core/errors"
import {
  customOpenAiModelIdForProfile,
  gateModelForAgentSupport,
  gateModelForKeys,
  isCustomOpenAiModelId,
  modelUsesStandardChat,
  openAiCompatibleProfileIdFromModelId,
} from '@/src/shared/constants/ai-models.constants'
import {
  isOpenAiCompatibleRuntimeReady,
  resolveOpenAiCompatibleConversationMode,
  resolveOpenAiCompatibleProfile,
} from '@/src/shared/utils/openai-compatible.utils'
import {
  normalizeOpenAiCompatibleTransport,
  type OpenAiCompatibleProfile,
} from '@/src/shared/types/openai-compatible.types'

/**
 * Destination + execution identity for one chat transcript. A custom endpoint
 * is more than its logical picker id: editing the URL/upstream model/transport
 * or changing whether it receives Agent tools creates a new privacy boundary.
 */
export function medicalChatRuntimeIdentity(
  modelId: string,
  profile: OpenAiCompatibleProfile | null,
): string {
  if (!isCustomOpenAiModelId(modelId)) {
    return JSON.stringify(['cloud', modelId])
  }
  return JSON.stringify([
    'custom',
    profile?.profileId ?? openAiCompatibleProfileIdFromModelId(modelId) ?? modelId,
    profile?.baseUrl ?? '',
    profile?.modelId ?? '',
    normalizeOpenAiCompatibleTransport(profile?.transport),
    resolveOpenAiCompatibleConversationMode(profile),
  ])
}

function useRuntimeBoundaryGuard(identity: string, credential: string | null) {
  /* eslint-disable react-hooks/refs -- This is an intentional synchronous
   * privacy gate. An external custom-to-cloud render must remain unable to
   * persist the previous transcript until its effect has cleared the chat. */
  const identityRef = useRef(identity)
  const credentialRef = useRef(credential)
  const transitionPending =
    identityRef.current !== identity || credentialRef.current !== credential

  const adopt = useCallback((nextIdentity: string, nextCredential: string | null) => {
    identityRef.current = nextIdentity
    credentialRef.current = nextCredential
  }, [])

  return { transitionPending, adopt }
  /* eslint-enable react-hooks/refs */
}

export default function MedicalChat() {
  const { t } = useLanguage()
  const { user, isAnonymous, loading: authLoading } = useAuth()
  // The chat's own persisted pick, already key-gated (what will actually run).
  // Picked in-panel (header strip; toolbar in expanded mode), not in Settings.
  const model = useEffectiveModel('chat')
  const chatModelPref = useModelPref('chat')
  const setModelFor = useSetModelFor()
  const openAiKey = useAiConfigStore((state) => state.apiKey)
  const geminiKey = useAiConfigStore((state) => state.geminiKey)
  const claudeKey = useAiConfigStore((state) => state.claudeKey)
  const openAiCompatibleProfiles = useAiConfigStore(
    (state) => state.openAiCompatibleProfiles,
  )
  const openAiCompatible = resolveOpenAiCompatibleProfile(
    model,
    openAiCompatibleProfiles,
  )
  const customModelDisplayNames = useMemo<Readonly<Record<string, string>>>(() => (
    Object.fromEntries(openAiCompatibleProfiles.map((profile) => [
      customOpenAiModelIdForProfile(profile.profileId),
      profile.modelId.trim(),
    ]))
  ), [openAiCompatibleProfiles])
  const isCustomEndpoint = isCustomOpenAiModelId(model)
  const isStandardChat = isCustomEndpoint
    ? resolveOpenAiCompatibleConversationMode(openAiCompatible) === 'standard'
    : modelUsesStandardChat(model)
  const runtimeIdentity = useMemo(
    () => medicalChatRuntimeIdentity(model, openAiCompatible),
    [model, openAiCompatible],
  )
  // Credentials are deliberately tracked outside runtimeIdentity: a replaced
  // secret is still a privacy boundary, but secrets must never enter a string
  // that might later be logged or surfaced for diagnostics.
  const runtimeCredential = openAiCompatible?.apiKey ?? null
  // This guard is also a synchronous history gate. On an externally-triggered
  // custom -> cloud transition the render sees a new identity before the
  // boundary effect can clear messages; retaining the old boundary prevents
  // Firestore auto-save / smart-title effects from observing that old text.
  const {
    transitionPending: runtimeTransitionPending,
    adopt: adoptRuntimeBoundary,
  } = useRuntimeBoundaryGuard(runtimeIdentity, runtimeCredential)
  const [, rerenderAfterRuntimeBoundary] = useState(0)
  // Selecting the hospital endpoint is also a privacy boundary: chat messages
  // must not be copied to Firestore or title/suggestion helper proxies.
  const cloudChatHistoryEnabled = !!user && !isCustomEndpoint &&
    !runtimeTransitionPending
  const { systemPrompt, updateSystemPrompt, resetSystemPrompt, isCustomPrompt } = useSystemPrompt()
  const { addTemplate, updateTemplate, saveTemplates, maxTemplates, templates } = useChatTemplates()
  const input = useChatInput()
  const imageUpload = useImageUpload()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  
  // Expand/collapse state (independent UI state)
  const expandable = useExpandable()
  const { isExpanded } = expandable
  
  // Header visibility state (default collapsed for more chat space)
  const [showHeader, setShowHeader] = useState(false)
  const [localModeNoticeDismissed, setLocalModeNoticeDismissed] = useState(false)
  
  // Prompt Gallery state
  const [showPromptGallery, setShowPromptGallery] = useState(false)
  const [showTemplateManager, setShowTemplateManager] = useState(false)
  
  // Auth Dialog state
  const [showAuthDialog, setShowAuthDialog] = useState(false)

  // New-conversation confirm — only shown when the current chat would be lost
  const [showNewChatConfirm, setShowNewChatConfirm] = useState(false)
  const [replyDraft, setReplyDraft] = useState<ChatReplyReference | null>(null)
  
  // FHIR context for chat history (patient ID and server URL)
  const { patientId, fhirServerUrl } = useFhirContext()
  
  // FHIR error handling
  const { error: patientError } = usePatient()
  const { error: clinicalDataError } = useClinicalData()
  
  // Auto-save chat to Firestore (debounced)
  // Note: patientName is only used for UI display, never stored in Firestore
  // Auto-save is enabled when user is logged in, even without FHIR data
  const { forceSave } = useAutoSaveChat({
    patientId: patientId || undefined,
    fhirServerUrl: fhirServerUrl || undefined,
    debounceMs: 5000,
    enabled: cloudChatHistoryEnabled,
  })

  // AI smart title generation (after first response)
  useSmartTitleGeneration({ enabled: cloudChatHistoryEnabled })

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
      setReplyDraft(null)
      setIsTemporaryMode(true)
    } else {
      // Exiting: discard the in-memory temporary conversation.
      setMessagesGlobal([])
      setCurrentSessionId(null)
      setReplyDraft(null)
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
  
  // Mode follows the selected model. Cloud/tool-capable models use the deep
  // agent path; a hospital/local endpoint automatically takes the tool-less
  // standard path over the user-selected clinical snapshot.
  const chat = useAgentChat(systemPrompt, model, clearInputAndResetHeight, forceSave)

  // "Next step" suggestion chips, generated after each answer completes.
  const {
    suggestions: followupSuggestions,
    generate: generateFollowups,
    clear: clearFollowups,
  } = useFollowupSuggestions(isCustomEndpoint ? model : undefined)

  // Initial mount adopts the current destination. Subsequent changes are
  // privacy boundaries, including external profile edits/hydration that did
  // not originate from either visible ModelPicker.
  const resetActiveChat = chat.handleReset
  const resetChatForRuntimeBoundary = useCallback(() => {
    // handleReset aborts first, then synchronously clears the Zustand messages
    // and saved-session pointer. Do this while the OLD model is still active so
    // enabling cloud history on the next render can never observe local text.
    resetActiveChat()
    setReplyDraft(null)
    clearFollowups()
    setLocalModeNoticeDismissed(false)
  }, [resetActiveChat, clearFollowups])

  const resolveSelectedModel = useCallback((requestedModelId: string) => {
    const requestedProfile = resolveOpenAiCompatibleProfile(
      requestedModelId,
      openAiCompatibleProfiles,
    )
    const keyGatedModel = gateModelForKeys(
      requestedModelId,
      {
        openAiKey,
        geminiKey,
        claudeKey,
        customAvailable: isOpenAiCompatibleRuntimeReady(requestedProfile),
      },
      MODEL_PREF_DEFAULTS.chat,
    )
    return gateModelForAgentSupport(keyGatedModel, MODEL_PREF_DEFAULTS.chat)
  }, [claudeKey, geminiKey, openAiCompatibleProfiles, openAiKey])

  const handleModelSelect = useCallback((requestedModelId: string) => {
    const nextModel = resolveSelectedModel(requestedModelId)
    if (nextModel !== model) {
      const nextProfile = resolveOpenAiCompatibleProfile(
        nextModel,
        openAiCompatibleProfiles,
      )
      const nextIdentity = medicalChatRuntimeIdentity(nextModel, nextProfile)
      resetChatForRuntimeBoundary()
      // Suppress the defensive effect's duplicate reset after this controlled
      // switch; the privacy cleanup above has already completed synchronously.
      adoptRuntimeBoundary(nextIdentity, nextProfile?.apiKey ?? null)
    }
    setModelFor('chat', requestedModelId)
  }, [adoptRuntimeBoundary, model, openAiCompatibleProfiles, resetChatForRuntimeBoundary, resolveSelectedModel, setModelFor])

  useEffect(() => {
    if (!runtimeTransitionPending) return
    adoptRuntimeBoundary(runtimeIdentity, runtimeCredential)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- cleanup must precede persistence re-enable
    resetChatForRuntimeBoundary()
    // Clearing an already-empty store may not schedule a component render. The
    // explicit tick lets cloud persistence turn on only after the cleanup above.
    rerenderAfterRuntimeBoundary((revision) => revision + 1)
  }, [adoptRuntimeBoundary, resetChatForRuntimeBoundary, runtimeCredential, runtimeIdentity, runtimeTransitionPending])
  
  // Ensure chat.messages is always an array
  const chatMessages = useMemo(() => (
    Array.isArray(chat.messages) ? chat.messages : []
  ), [chat.messages])

  // Reset the conversation when the patient context changes (a local bundle is
  // imported or cleared). Chat messages are in-memory only, so without this the
  // previous patient's conversation would linger on the newly-loaded patient —
  // a privacy leak. handleReset stops any in-flight stream, clears the messages,
  // and drops the saved-session pointer so the next turn starts fresh. The ref
  // keeps the listener stable while always invoking the active mode's reset.
  const handleResetRef = useRef(chat.handleReset)
  useEffect(() => {
    handleResetRef.current = chat.handleReset
  }, [chat.handleReset])
  useEffect(() => {
    const onBundleChange = () => {
      setReplyDraft(null)
      handleResetRef.current()
    }
    window.addEventListener('mediprisma:local-bundle-changed', onBundleChange)
    return () => window.removeEventListener('mediprisma:local-bundle-changed', onBundleChange)
  }, [])

  const template = useTemplateSelector()

  // Start a new conversation. Logged-in (non-temp) chats are already auto-saved
  // to history, so we persist + start fresh silently; signed-out / temp-mode
  // chats would be lost, so confirm first.
  const handleNewConversation = useCallback(async () => {
    if (chatMessages.length === 0) {
      setReplyDraft(null)
      chat.handleReset()
      return
    }
    if (cloudChatHistoryEnabled && !isTemporaryMode) {
      try {
        await forceSave()
      } catch {
        // Best-effort save; still start the new chat.
      }
      setReplyDraft(null)
      chat.handleReset()
      toast.success(t.chat.newChatSavedToast)
      return
    }
    setShowNewChatConfirm(true)
  }, [chatMessages.length, cloudChatHistoryEnabled, isTemporaryMode, forceSave, chat, t])

  const confirmNewConversation = useCallback(() => {
    setShowNewChatConfirm(false)
    setReplyDraft(null)
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
  
  const voice = useVoiceRecording(
    handleTranscriptReady,
    isCustomEndpoint ? model : null,
  )
  const recordingStatus = useRecordingStatus(voice)

  // API key validation
  const { hasApiKey } = useApiKeyValidation(
    model,
    openAiKey,
    geminiKey,
    claudeKey,
    openAiCompatible,
  )

  // Agent chat runs through the Firebase proxy for ANY session — a real account
  // OR an anonymous free-tier visitor (small Perplexity/chat quota) — or with
  // the user's own API key. Anonymous visitors have `user === null` by design
  // (login-gated features stay gated), so a plain `!user` check wrongly blocks
  // them; include `isAnonymous`. Only warn once auth has resolved and there is
  // genuinely no path (which means anonymous sign-in itself is unavailable).
  const apiKeyAvailable = hasApiKey()
  const canUseChat = isCustomEndpoint
    ? apiKeyAvailable
    : apiKeyAvailable || !!user || isAnonymous
  const showApiKeyWarning = !authLoading && !canUseChat

  // Clear images after sending message
  const clearImagesAfterSend = useCallback(() => {
    imageUpload.clearImages()
  }, [imageUpload])

  // Handlers
  const handleSend = useCallback(async (overrideText?: string) => {
    // A suggestion chip passes its prompt as overrideText; clear the chips on
    // any send so they don't linger across the new exchange.
    clearFollowups()
    const trimmed = (typeof overrideText === "string" ? overrideText : input.input).trim()
    const hasImages = imageUpload.images.length > 0
    const activeReply = typeof overrideText === "string" ? null : replyDraft
    
    // Require either text or images
    if (!trimmed && !hasImages) return
    
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
    setReplyDraft(null)
    
    // Clear images after successful send
    clearImagesAfterSend()
    
    // Pass images to chat handler (this will add user message to state)
    // Note: handleSend is async and will start streaming, but user message is added to state immediately
    const sendPromise = chat.handleSend(trimmed, chatImages, activeReply)
    
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
  }, [input, imageUpload.images, replyDraft, chat, clearImagesAfterSend, clearInputAndResetHeight, forceSave, clearFollowups])

  const handleReplyToSelection = useCallback((reply: ChatReplyReference) => {
    setReplyDraft(reply)
    window.setTimeout(() => textareaRef.current?.focus(), 0)
  }, [])

  // Generate "next step" chips when an assistant answer finishes streaming.
  // Guarded by the assistant message id so it fires once per answer; clears when
  // the conversation is emptied. Fails closed inside the hook.
  const lastSuggestedIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (chat.isLoading) return
    if (chatMessages.length === 0) {
      lastSuggestedIdRef.current = null
      clearFollowups()
      return
    }
    const last = chatMessages[chatMessages.length - 1]
    const content = (last?.content || "").trim()
    if (!last || last.role !== "assistant" || !content) return
    // Skip the thinking placeholder and surfaced errors.
    if (content.startsWith("🤔") || content.startsWith("❌")) return
    if (lastSuggestedIdRef.current === last.id) return
    // The reader's own questions this session feed implicit personalisation; the
    // last one is the current question (buildMessages filters it out of "recent").
    const userMessages = chatMessages.filter((m) => m.role === "user").map((m) => m.content)
    const lastUser = userMessages[userMessages.length - 1]
    if (!lastUser) return
    lastSuggestedIdRef.current = last.id
    generateFollowups(lastUser, content, {
      recentUserMessages: userMessages,
      isDeepMode: !isStandardChat,
    })
  }, [chat.isLoading, chatMessages, generateFollowups, clearFollowups, isStandardChat])
  
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

  const handleInsertTemplate = useCallback(() => {
    const templateContent = template.selectedTemplate?.content?.trim()
    if (templateContent) {
      input.insertTextWithTrim(templateContent)
      scrollTextareaToBottom()
    }
  }, [input, template.selectedTemplate, scrollTextareaToBottom])

  // Handle prompt selection from gallery
  const handleSelectPrompt = useCallback((prompt: SharedPrompt, useAs?: PromptType) => {
    // Insert prompt content into chat input
    input.insertTextWithTrim(prompt.prompt)
    scrollTextareaToBottom()
    
    // Also add to chat templates if useAs is 'chat' or undefined
    if (useAs !== 'summary' && templates.length < maxTemplates) {
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
            <ChatHistoryDrawer persistenceEnabled={cloudChatHistoryEnabled} />
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
          {/* In normal flow (not absolutely centered): the right-side group
              grew a model picker, and a centered overlay overlapped it at
              typical panel widths. justify-between keeps this visually
              near-center without ever colliding. */}
          <button
            onClick={() => setShowHeader(!showHeader)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0 px-1 whitespace-nowrap"
            title={showHeader ? t.chat.hideHeader : t.chat.showHeader}
          >
            {showHeader ? `▲ ${t.chat.hideHeader}` : `▼ ${t.chat.showHeader}`}
          </button>
          <div className="flex min-w-0 items-center gap-1">
            {/* The toolbar above the input is already crowded — the model
                picker lives here in the header strip instead. */}
            <ModelPicker
              modelId={chatModelPref}
              fallbackModelId={MODEL_PREF_DEFAULTS.chat}
              onSelect={handleModelSelect}
              tooltip={isStandardChat
                ? t.medicalChat.localStandardModeTitle
                : t.modelPicker.chatTooltip}
              agentModeActive
            />
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
            </div>
          </div>
        )}
        <ChatMessageList
          messages={chatMessages}
          isLoading={chat.isLoading}
          isStandardChatMode={isStandardChat}
          customModelDisplayNames={customModelDisplayNames}
          scrollSignal={followupSuggestions.length}
          onReplyToSelection={handleReplyToSelection}
          afterMessages={
            <SuggestionChips
              suggestions={followupSuggestions}
              onPick={(p) => handleSend(p)}
              disabled={chat.isLoading}
            />
          }
        />
      </CardContent>

      <CardFooter className="flex flex-col gap-2 border-t px-3 sm:px-6 !pt-2 pb-2 shrink-0">
        <div className="flex w-full flex-col gap-1">
          <ChatToolbar
            onInsertTemplate={handleInsertTemplate}
            templates={template.templates}
            selectedTemplateId={template.selectedTemplate?.id}
            onTemplateChange={template.setSelectedTemplateId}
            hasTemplateContent={!!template.selectedTemplate?.content?.trim()}
            onOpenGallery={() => setShowPromptGallery(true)}
            onManageTemplates={() => setShowTemplateManager(true)}
            onModelSelect={handleModelSelect}
            showModelPicker={isExpanded}
          />
          {showApiKeyWarning && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs">
              <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1 text-amber-800 dark:text-amber-200">
                <div className="font-medium mb-1">
                  {isCustomEndpoint
                    ? t.settings.openAiCompatibleNotConfigured
                    : t.medicalChat.apiKeyWarningTitle}
                </div>
                <div className="text-amber-700 dark:text-amber-300">
                  {isCustomEndpoint
                    ? t.settings.openAiCompatibleConfigureToUse
                    : t.medicalChat.apiKeyWarningMessage.split(t.medicalChat.loginLink).map((part, index, array) => (
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
          {isCustomEndpoint && isStandardChat && canUseChat && !localModeNoticeDismissed && (
            <div
              role="status"
              className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50/80 px-3 py-2 text-xs text-sky-900 dark:border-sky-900 dark:bg-sky-950/35 dark:text-sky-100"
            >
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{t.medicalChat.localStandardModeTitle}</div>
                <div className="mt-0.5 leading-relaxed text-sky-800/90 dark:text-sky-200/85">
                  {t.medicalChat.localStandardModeDescription}
                </div>
                <div className="mt-1 font-medium text-sky-700 dark:text-sky-300">
                  {t.medicalChat.localStandardModeSwitchHint}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLocalModeNoticeDismissed(true)}
                aria-label={t.common.close}
                title={t.common.close}
                className="-mr-1 -mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sky-700/70 transition-colors hover:bg-sky-100 hover:text-sky-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-sky-200/70 dark:hover:bg-sky-900/60 dark:hover:text-sky-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          {isQuotaExceededError(chat.error) && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs">
              <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1 text-amber-800 dark:text-amber-200">
                <div className="font-medium mb-1">{t.medicalChat.quotaBannerTitle}</div>
                <div className="text-amber-700 dark:text-amber-300">
                  {(!user || isAnonymous)
                    ? t.medicalChat.quotaBannerMessageAnon.split(t.medicalChat.loginLink).map((part, index, array) => (
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
                      ))
                    : t.medicalChat.quotaBannerMessageUser}
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
            disabled={!canUseChat}
            isPrivateEndpoint={isCustomEndpoint}
            replyDraft={replyDraft}
            onCancelReply={() => setReplyDraft(null)}
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
        <ChatTemplatesManagerDrawer
          open={showTemplateManager}
          onOpenChange={setShowTemplateManager}
          initialTemplateId={template.selectedTemplate?.id}
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
      <ChatTemplatesManagerDrawer
        open={showTemplateManager}
        onOpenChange={setShowTemplateManager}
        initialTemplateId={template.selectedTemplate?.id}
      />
      <AuthDialog
        open={showAuthDialog}
        onOpenChange={setShowAuthDialog}
      />
      {newChatConfirmDialog}
    </>
  )
}
