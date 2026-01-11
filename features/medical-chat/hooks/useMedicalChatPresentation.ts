/**
 * Medical Chat Presentation Hook
 * 
 * Consolidates all presentation logic for the Medical Chat component.
 * Following Separation of Concerns: Component only handles rendering,
 * this hook handles all the business logic and state coordination.
 * 
 * Benefits:
 * - Reduces component complexity
 * - Makes logic testable in isolation
 * - Improves code organization
 * - Easier to maintain and debug
 */
import { useCallback, useEffect, useRef } from "react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useModelSelection } from "@/src/application/providers/model-selection.provider"
import { useApiKey } from "@/src/application/providers/api-key.provider"
import { useStreamingChat } from "./useStreamingChat"
import { useAgentChat } from "./useAgentChat"
import { useVoiceRecording } from "./useVoiceRecording"
import { useTemplateSelector } from "./useTemplateSelector"
import { useChatInput } from "./useChatInput"
import { useSystemPrompt } from "./useSystemPrompt"
import { useRecordingStatus } from "./useRecordingStatus"
import { useAgentMode } from "./useAgentMode"
import { useExpandable } from "@/src/shared/hooks/ui/use-expandable.hook"
import { useClinicalContext } from "@/src/application/hooks/use-clinical-context.hook"
import { getModelDefinition } from "@/src/shared/constants/ai-models.constants"

export function useMedicalChatPresentation() {
  const { t } = useLanguage()
  const { model } = useModelSelection()
  const { apiKey: openAiKey, geminiKey } = useApiKey()
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
    
    textarea.style.height = 'auto'
    textarea.style.height = `${textarea.scrollHeight}px`
  }, [input.input])

  // Handle clinical context insertion
  const handleInsertContext = useCallback(() => {
    const context = getFullClinicalContext()
    if (context) {
      input.insertTextWithTrim(context)
      if (textareaRef.current) {
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.scrollTop = textareaRef.current.scrollHeight
          }
        }, 0)
      }
    }
  }, [getFullClinicalContext, input])

  // Scroll textarea to bottom
  const scrollTextareaToBottom = useCallback(() => {
    if (textareaRef.current) {
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.scrollTop = textareaRef.current.scrollHeight
        }
      }, 0)
    }
  }, [])

  // Handle template insertion
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
  }, [isExpanded, expandable])

  return {
    // Refs
    textareaRef,
    
    // State
    t,
    model,
    systemPrompt,
    isCustomPrompt,
    isAgentMode,
    showApiKeyWarning,
    isExpanded,
    
    // Chat
    chat,
    input,
    
    // Voice
    voice,
    recordingStatus,
    
    // Template
    template,
    
    // Expandable
    expandable,
    
    // Handlers
    handleSend,
    handleAgentModeToggle,
    handleInsertContext,
    handleInsertTemplate,
    updateSystemPrompt,
    resetSystemPrompt,
  }
}
