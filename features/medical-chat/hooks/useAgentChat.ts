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
        // Literature search is available if user has Perplexity API key OR is authenticated (can use proxy)
        const hasLiteratureSearch = !!perplexityKey || !!user
        const enhancedSystemPrompt = buildAgentSystemPromptUseCase.execute({
          baseSystemPrompt: systemPrompt,
          clinicalContext: '', // Empty - let user control via toggle
          patientId: patient?.id,
          hasPerplexityKey: hasLiteratureSearch,
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
                .map(tc => getToolDisplayName(tc?.toolName || '', t.agent.toolNames))
                .join('、')
              
              const newState = `🔍 ${toolNames}...`
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
        let usedToolNames: string[] = [] // Track which tools were called
        let lastUpdateTime = 0
        let timeoutId: NodeJS.Timeout | null = null
        const UPDATE_INTERVAL = 100 // Update every 100ms to prevent blocking

        // Process stream chunks
        for await (const chunk of result.fullStream) {
          if (chunk.type === 'text-delta') {
            accumulatedContent += chunk.text

            if (!hasReceivedChunkRef.current && onInputClear) {
              hasReceivedChunkRef.current = true
              onInputClear()
            }

            // Throttle updates to prevent main thread blocking
            const now = Date.now()
            if (now - lastUpdateTime >= UPDATE_INTERVAL) {
              lastUpdateTime = now
              setChatMessages((prev) =>
                prev.map((m) => m.id === assistantMessageId ? { ...m, content: accumulatedContent } : m)
              )
            } else if (!timeoutId) {
              timeoutId = setTimeout(() => {
                lastUpdateTime = Date.now()
                setChatMessages((prev) =>
                  prev.map((m) => m.id === assistantMessageId ? { ...m, content: accumulatedContent } : m)
                )
                timeoutId = null
              }, UPDATE_INTERVAL - (now - lastUpdateTime))
            }
          } else if (chunk.type === 'tool-call') {
            const displayName = getToolDisplayName(chunk.toolName, t.agent.toolNames)
            const newState = `🔍 ${displayName}...`
            
            // Track tool name
            if (!usedToolNames.includes(chunk.toolName)) {
              usedToolNames.push(chunk.toolName)
            }
            
            setChatMessages((prev) =>
              prev.map((m) => m.id === assistantMessageId 
                ? { 
                    ...m, 
                    content: newState,
                    agentStates: [...(m.agentStates || []), { state: newState, timestamp: Date.now() }],
                    toolCalls: usedToolNames
                  } 
                : m)
            )
          } else if (chunk.type === 'tool-result') {
            // Collect tool results - handle both 'result' and 'output' properties
            const chunkAny = chunk as any
            const result = chunkAny.result ?? chunkAny.output ?? chunkAny.toolResult ?? chunkAny
            toolResults.push({ toolName: chunk.toolName, result })
          }
        }
        
        // Ensure final content is displayed after main stream
        if (accumulatedContent.length > 0) {
          setChatMessages((prev) =>
            prev.map((m) => m.id === assistantMessageId ? { ...m, content: accumulatedContent, toolCalls: usedToolNames.length > 0 ? usedToolNames : undefined } : m)
          )
        }
        
        // Handle follow-up if there are tool results but no text
        if (toolResults.length > 0 && accumulatedContent.length === 0) {
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
          const { summary: toolResultsSummary, citations: literatureCitations } = 
            processAgentStreamUseCase.buildToolResultsSummary(toolResults, {
              queryResult: t.agent.queryResult,
              queryFailed: t.agent.queryFailed,
              noData: t.agent.noData,
              noDataFound: t.agent.noDataFound,
              foundRecords: t.agent.foundRecords,
            })
          
          const originalQuestion = newMessages[newMessages.length - 1]?.content || trimmed
          const followUpMessages = processAgentStreamUseCase.buildFollowUpMessages(
            apiMessages,
            toolResultsSummary,
            originalQuestion,
            {
              queriedFhirData: t.agent.queriedFhirData,
              answerQuestion: t.agent.answerQuestion,
            }
          )
          
          const followUpResult = await streamText({
            model,
            messages: followUpMessages,
            tools, // Allow AI to call more tools in follow-up (e.g., searchMedicalLiterature after FHIR query)
            abortSignal: abortControllerRef.current?.signal,
          })
          
          let followUpContent = ""
          let followUpToolResults: Array<{ toolName: string; result: unknown }> = []
          let followUpLastUpdateTime = 0
          let followUpTimeoutId: NodeJS.Timeout | null = null
          
          for await (const chunk of followUpResult.fullStream) {
            if (chunk.type === 'text-delta') {
              followUpContent += chunk.text
              
              // Throttle follow-up updates too
              const now = Date.now()
              if (now - followUpLastUpdateTime >= UPDATE_INTERVAL) {
                followUpLastUpdateTime = now
                setChatMessages((prev) =>
                  prev.map((m) => m.id === assistantMessageId ? { ...m, content: followUpContent } : m)
                )
              } else if (!followUpTimeoutId) {
                followUpTimeoutId = setTimeout(() => {
                  followUpLastUpdateTime = Date.now()
                  setChatMessages((prev) =>
                    prev.map((m) => m.id === assistantMessageId ? { ...m, content: followUpContent } : m)
                  )
                  followUpTimeoutId = null
                }, UPDATE_INTERVAL - (now - followUpLastUpdateTime))
              }
            } else if (chunk.type === 'tool-call') {
              const displayName = getToolDisplayName(chunk.toolName, t.agent.toolNames)
              const newState = `🔍 ${displayName}...`
              
              // Track tool name
              if (!usedToolNames.includes(chunk.toolName)) {
                usedToolNames.push(chunk.toolName)
              }
              
              setChatMessages((prev) =>
                prev.map((m) => m.id === assistantMessageId 
                  ? { 
                      ...m, 
                      content: newState,
                      agentStates: [...(m.agentStates || []), { state: newState, timestamp: Date.now() }],
                      toolCalls: usedToolNames
                    } 
                  : m)
              )
            } else if (chunk.type === 'tool-result') {
              // Collect tool results from follow-up
              const chunkAny = chunk as any
              const result = chunkAny.result ?? chunkAny.output ?? chunkAny.toolResult ?? chunkAny
              followUpToolResults.push({ toolName: chunk.toolName, result })
            }
          }
          
          // If follow-up had tool results but no text, force AI to generate response
          if (followUpToolResults.length > 0 && followUpContent.length === 0) {
            const finalOrgState = `📝 ${t.agent.organizingResults}`
            setChatMessages((prev) =>
              prev.map((m) => m.id === assistantMessageId 
                ? { 
                    ...m, 
                    content: finalOrgState,
                    agentStates: [...(m.agentStates || []), { state: finalOrgState, timestamp: Date.now() }]
                  } 
                : m)
            )
            
            // Build summary from follow-up tool results
            const { summary: finalToolSummary } = 
              processAgentStreamUseCase.buildToolResultsSummary(followUpToolResults, {
                queryResult: t.agent.queryResult,
                queryFailed: t.agent.queryFailed,
                noData: t.agent.noData,
                noDataFound: t.agent.noDataFound,
                foundRecords: t.agent.foundRecords,
              })
            
            // Force AI to generate final response with all tool results
            const finalMessages = [
              ...followUpMessages,
              {
                role: 'user' as const,
                content: `${finalToolSummary}\n\nIMPORTANT: You MUST now provide a comprehensive answer in Traditional Chinese based on ALL the tool results above. Do NOT call any more tools. Just synthesize and present the information.`
              }
            ]
            
            const finalResult = await streamText({
              model,
              messages: finalMessages,
              abortSignal: abortControllerRef.current?.signal,
            })
            
            let finalContent = ""
            for await (const chunk of finalResult.fullStream) {
              if (chunk.type === 'text-delta') {
                finalContent += chunk.text
                setChatMessages((prev) =>
                  prev.map((m) => m.id === assistantMessageId ? { ...m, content: finalContent } : m)
                )
              }
            }
            
            followUpContent = finalContent
          }
          
          setChatMessages((prev) =>
            prev.map((m) => m.id === assistantMessageId ? { ...m, content: followUpContent, toolCalls: usedToolNames.length > 0 ? usedToolNames : undefined } : m)
          )
          
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
        } else if (toolResults.length > 0 && accumulatedContent.length > 0) {
          // AI generated response directly with tool calls - process citations
          const { citations: literatureCitations } = 
            processAgentStreamUseCase.buildToolResultsSummary(toolResults, {
              queryResult: t.agent.queryResult,
              queryFailed: t.agent.queryFailed,
              noData: t.agent.noData,
              noDataFound: t.agent.noDataFound,
              foundRecords: t.agent.foundRecords,
            })
          
          if (literatureCitations.length > 0) {
            const { processedContent } = processAgentStreamUseCase.processCitations({
              content: accumulatedContent,
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
