// Agent Chat Hook - Refactored
"use client"

import { useState, useCallback, useRef, useMemo } from "react"
import { streamText } from "ai"
import { useChatMessages, useSetChatMessages, type ChatMessage, type ChatImage } from "@/src/application/stores/chat.store"
import { useAllApiKeys } from "@/src/application/stores/ai-config.store"
import { usePatient } from "@/src/application/hooks/patient/use-patient-query.hook"
import { getUserErrorMessage } from "@/src/core/errors"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useClinicalContext } from "@/src/application/hooks/use-clinical-context.hook"
import { useFhirTools } from "@/src/application/hooks/ai/use-fhir-tools.hook"
import { useLiteratureTools } from "@/src/application/hooks/ai/use-literature-tools.hook"
import { createUserMessage, createAgentState } from "@/src/shared/utils/chat-message.utils"
import { useAuth } from "@/src/application/providers/auth.provider"
import { aiProviderFactory } from "@/src/infrastructure/ai/factories/ai-provider.factory"
import { buildAgentSystemPromptUseCase } from "@/src/core/use-cases/agent/build-agent-system-prompt.use-case"
import { processAgentStreamUseCase } from "@/src/core/use-cases/agent/process-agent-stream.use-case"
import { getToolDisplayName } from "@/src/shared/constants/agent-tool-names.constants"

export function useAgentChat(systemPrompt: string, modelId: string, onInputClear?: () => void, onStreamComplete?: () => void) {
  const chatMessages = useChatMessages()
  const setChatMessages = useSetChatMessages()
  const { apiKey: openAiKey, geminiKey, perplexityKey } = useAllApiKeys()
  const { patient } = usePatient()
  const { locale, t } = useLanguage()
  const { getFullClinicalContext } = useClinicalContext()
  const { user } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const hasReceivedChunkRef = useRef(false)

  const fhirTools = useFhirTools(patient?.id)
  const literatureTools = useLiteratureTools(perplexityKey)

  const tools = useMemo(() => {
    if (!fhirTools && !literatureTools) return undefined
    return {
      ...(fhirTools || {}),
      ...(literatureTools || {}),
    }
  }, [fhirTools, literatureTools])

  const handleSend = useCallback(
    async (input: string, images?: ChatImage[]) => {
      hasReceivedChunkRef.current = false
      const trimmed = input.trim()
      if (!trimmed && (!images || images.length === 0)) return

      // Create user message with images
      const userMessage = createUserMessage(trimmed, images)
      const newMessages = [...chatMessages, userMessage]
      setChatMessages(newMessages)

      // Create assistant message with thinking state
      const assistantMessageId = crypto.randomUUID()
      const thinkingMessage = `🤔 ${t.agent.thinking}`
      const initialState = createAgentState(thinkingMessage)
      
      setChatMessages([...newMessages, {
        id: assistantMessageId,
        role: "assistant",
        content: thinkingMessage,
        timestamp: Date.now(),
        modelId,
        agentStates: [initialState],
      }])

      setIsLoading(true)
      setError(null)
      abortControllerRef.current = new AbortController()

      try {
        const isGemini = modelId.startsWith("gemini") || modelId.startsWith("models/gemini")
        const apiKey = isGemini ? geminiKey : openAiKey

        // Check if user can use deep mode
        if (!apiKey && !user) {
          setChatMessages((prev) =>
            prev.map((m) => m.id === assistantMessageId ? { ...m, content: t.agent.apiKeyRequired } : m)
          )
          setIsLoading(false)
          return
        }

        // Validate proxy availability for logged-in users without API key
        const useProxy = !apiKey && !!user
        if (useProxy) {
          const validation = aiProviderFactory.validateProxyAvailability(modelId)
          if (!validation.available) {
            setChatMessages((prev) =>
              prev.map((m) => m.id === assistantMessageId ? { ...m, content: validation.error || t.agent.apiKeyRequired } : m)
            )
            setIsLoading(false)
            return
          }
        }

        // Create AI provider using factory
        const { model } = aiProviderFactory.create({
          modelId,
          apiKey: apiKey || undefined,
          useProxy,
        })

        // Build enhanced system prompt using use case
        // Note: Clinical context is no longer automatically included
        // Users can choose to include it via the auto-include toggle (consistent with normal mode)
        const enhancedSystemPrompt = buildAgentSystemPromptUseCase.execute({
          baseSystemPrompt: systemPrompt,
          clinicalContext: '', // Empty - let user control via toggle
          patientId: patient?.id,
          hasPerplexityKey: !!perplexityKey,
          translations: t.agent.systemPrompt,
        })

        const apiMessages = [
          { role: "system" as const, content: enhancedSystemPrompt },
          ...newMessages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        ]

        // Stream with tools
        const result = await streamText({
          model,
          messages: apiMessages,
          tools,
          abortSignal: abortControllerRef.current.signal,
          onStepFinish: ({ toolCalls }) => {
            if (toolCalls && toolCalls.length > 0) {
              const toolNames = toolCalls
                .map(tc => getToolDisplayName(tc?.toolName || ''))
                .join('、')
              
              const newState = `🔍 正在${toolNames}...`
              setChatMessages((prev) =>
                prev.map((m) => m.id === assistantMessageId 
                  ? { 
                      ...m, 
                      content: newState,
                      agentStates: [...(m.agentStates || []), { state: newState, timestamp: Date.now() }]
                    } 
                  : m)
              )
            }
          },
        })

        let accumulatedContent = ""
        let updateScheduled = false
        let hasToolCalls = false

        // Process stream chunks with performance optimization
        for await (const chunk of result.fullStream) {
          if (chunk.type === 'text-delta') {
            accumulatedContent += chunk.text

            if (!hasReceivedChunkRef.current && onInputClear) {
              hasReceivedChunkRef.current = true
              onInputClear()
            }

            // Batch updates using requestAnimationFrame to reduce re-renders
            if (!updateScheduled) {
              updateScheduled = true
              requestAnimationFrame(() => {
                setChatMessages((prev) =>
                  prev.map((m) => m.id === assistantMessageId ? { ...m, content: accumulatedContent } : m)
                )
                updateScheduled = false
              })
            }
          } else if (chunk.type === 'tool-call') {
            hasToolCalls = true
            const displayName = getToolDisplayName(chunk.toolName)
            const newState = `🔍 ${displayName}...`
            setChatMessages((prev) =>
              prev.map((m) => m.id === assistantMessageId 
                ? { 
                    ...m, 
                    content: newState,
                    agentStates: [...(m.agentStates || []), { state: newState, timestamp: Date.now() }]
                  } 
                : m)
            )
          }
        }
        
        // Final update to ensure all content is displayed
        setChatMessages((prev) =>
          prev.map((m) => m.id === assistantMessageId ? { ...m, content: accumulatedContent } : m)
        )

        // Manual follow-up if tools were called but no text response
        if (hasToolCalls && accumulatedContent.length === 0) {
          console.log('[Agent] Tools were called but no text response, generating follow-up...')
          const organizingState = `📝 ${t.agent.organizingResults}`
          setChatMessages((prev) =>
            prev.map((m) => m.id === assistantMessageId 
              ? { 
                  ...m, 
                  content: organizingState,
                  agentStates: [...(m.agentStates || []), { state: organizingState, timestamp: Date.now() }]
                } 
              : m)
          )

          try {
            // Get the original user question
            const originalQuestion = newMessages.find(m => m.role === 'user')?.content || ''
            
            // Generate follow-up response with proper prompt
            const followUpPrompt = locale === 'zh-TW'
              ? `請根據上述查詢結果，用繁體中文回答我的原始問題。\n\n**重要**：\n1. 直接回答問題，不要輸出你的思考過程\n2. 如果查詢結果中包含引用編號（如 [1][2][3]），請在回答中保留這些引用編號\n3. 如果查詢結果顯示沒有資料，請明確告知\n\n原始問題：「${originalQuestion}」`
              : `Please answer my original question based on the query results above.\n\n**Important**:\n1. Answer directly without showing your thinking process\n2. If the results contain citation numbers (like [1][2][3]), keep them in your answer\n3. If no data was found, clearly state that\n\nOriginal question: "${originalQuestion}"`
            
            const followUpResult = await streamText({
              model,
              messages: [
                ...apiMessages,
                { role: 'assistant' as const, content: t.agent.queriedFhirData },
                { role: 'user' as const, content: followUpPrompt },
              ],
              abortSignal: abortControllerRef.current?.signal,
            })

            let followUpContent = ""
            let followUpUpdateScheduled = false
            
            for await (const chunk of followUpResult.fullStream) {
              if (chunk.type === 'text-delta') {
                followUpContent += chunk.text
                
                // Batch follow-up updates too
                if (!followUpUpdateScheduled) {
                  followUpUpdateScheduled = true
                  requestAnimationFrame(() => {
                    setChatMessages((prev) =>
                      prev.map((m) => m.id === assistantMessageId ? { ...m, content: followUpContent } : m)
                    )
                    followUpUpdateScheduled = false
                  })
                }
              }
            }
            
            // Final follow-up update
            setChatMessages((prev) =>
              prev.map((m) => m.id === assistantMessageId ? { ...m, content: followUpContent } : m)
            )
            console.log('[Agent] Follow-up completed, content length:', followUpContent.length)
          } catch (followUpError) {
            console.error('[Agent] Follow-up generation failed:', followUpError)
            setChatMessages((prev) =>
              prev.map((m) => m.id === assistantMessageId 
                ? { ...m, content: `❌ ${t.agent.organizingResults}失敗，請重試` } 
                : m)
            )
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return
        
        const errorMessage = getUserErrorMessage(err)
        const errorObj = new Error(errorMessage)
        setError(errorObj)
        setChatMessages((prev) =>
          prev.map((m) => m.id === assistantMessageId ? { ...m, content: `❌ ${errorMessage}` } : m)
        )
      } finally {
        setIsLoading(false)
        abortControllerRef.current = null
        
        // Trigger save after agent completes
        if (onStreamComplete) {
          try {
            await onStreamComplete()
          } catch (error) {
            console.error('[Agent] onStreamComplete callback failed:', error)
          }
        }
      }
    },
    [chatMessages, modelId, openAiKey, geminiKey, patient, setChatMessages, systemPrompt, onInputClear, onStreamComplete, locale, tools, user, perplexityKey, getFullClinicalContext, t]
  )

  const handleReset = useCallback(() => {
    abortControllerRef.current?.abort()
    setChatMessages([])
    const { setCurrentSessionId } = require('@/src/application/stores/chat-history.store').useChatHistoryStore.getState()
    setCurrentSessionId(null)
  }, [setChatMessages])

  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort()
    setIsLoading(false)
  }, [])

  return { messages: chatMessages, isLoading, error, handleSend, handleReset, stopGeneration }
}
