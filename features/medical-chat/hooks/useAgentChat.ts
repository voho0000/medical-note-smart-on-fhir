// Agent Chat Hook - Refactored
"use client"

import { useState, useCallback, useRef, useMemo } from "react"
import { streamText } from "ai"
import { useChatMessages, useSetChatMessages, type ChatMessage } from "@/src/application/stores/chat.store"
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
    async (input: string) => {
      hasReceivedChunkRef.current = false
      const trimmed = input.trim()
      if (!trimmed) return

      // Create user message
      const userMessage = createUserMessage(trimmed)
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
        let toolResults: Array<{ toolName: string; result: unknown }> = []

        // Process stream chunks
        for await (const chunk of result.fullStream) {
          if (chunk.type === 'text-delta') {
            accumulatedContent += chunk.text

            if (!hasReceivedChunkRef.current && onInputClear) {
              hasReceivedChunkRef.current = true
              onInputClear()
            }

            setChatMessages((prev) =>
              prev.map((m) => m.id === assistantMessageId ? { ...m, content: accumulatedContent } : m)
            )
          } else if (chunk.type === 'tool-call') {
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
          } else if (chunk.type === 'tool-result') {
            const chunkAny = chunk as any
            const result = chunkAny.result ?? chunkAny.output ?? chunkAny.toolResult ?? chunkAny
            toolResults.push({ toolName: chunk.toolName, result })
          }
        }
        
        // Handle follow-up if there are tool results but no text
        console.log('[Agent] Tool results count:', toolResults.length, 'Accumulated content length:', accumulatedContent.length)
        if (toolResults.length > 0 && accumulatedContent.length === 0) {
          console.log('[Agent] Starting follow-up response generation...')
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
          
          // Build tool results summary using use case
          console.log('[Agent] Building tool results summary...')
          const { summary: toolResultsSummary, citations: literatureCitations } = 
            processAgentStreamUseCase.buildToolResultsSummary(toolResults, {
              queryResult: t.agent.queryResult,
              queryFailed: t.agent.queryFailed,
              noData: t.agent.noData,
              noDataFound: t.agent.noDataFound,
              foundRecords: t.agent.foundRecords,
            })
          console.log('[Agent] Tool results summary:', toolResultsSummary)
          
          const originalQuestion = newMessages[newMessages.length - 1]?.content || trimmed
          console.log('[Agent] Original question:', originalQuestion)
          const followUpMessages = processAgentStreamUseCase.buildFollowUpMessages(
            apiMessages,
            toolResultsSummary,
            originalQuestion,
            {
              queriedFhirData: t.agent.queriedFhirData,
              answerQuestion: t.agent.answerQuestion,
            }
          )
          console.log('[Agent] Follow-up messages:', followUpMessages)
          
          console.log('[Agent] Starting follow-up stream...')
          const followUpResult = await streamText({
            model,
            messages: followUpMessages,
            abortSignal: abortControllerRef.current?.signal,
          })
          
          let followUpContent = ""
          for await (const chunk of followUpResult.fullStream) {
            if (chunk.type === 'text-delta') {
              followUpContent += chunk.text
              setChatMessages((prev) =>
                prev.map((m) => m.id === assistantMessageId ? { ...m, content: followUpContent } : m)
              )
            }
          }
          console.log('[Agent] Follow-up content generated:', followUpContent)
          
          // Process citations if available
          if (literatureCitations.length > 0) {
            const { processedContent } = processAgentStreamUseCase.processCitations({
              content: followUpContent,
              citations: literatureCitations,
            })
            
            setChatMessages((prev) =>
              prev.map((m) => m.id === assistantMessageId ? { ...m, content: processedContent } : m)
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
