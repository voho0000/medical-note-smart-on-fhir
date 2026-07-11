// Agent Chat Hook - Refactored
"use client"

import { useState, useCallback, useRef, useMemo } from "react"
import { useChatMessages, useSetChatMessages, type ChatMessage, type ChatImage } from "@/src/application/stores/chat.store"
import { useAllApiKeys } from "@/src/application/stores/ai-config.store"
import { usePatient } from "@/src/application/hooks/patient/use-patient-query.hook"
import { getUserErrorMessage } from "@/src/core/errors"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useFhirTools } from "@/src/application/hooks/ai/use-fhir-tools.hook"
import { useLiteratureTools } from "@/src/application/hooks/ai/use-literature-tools.hook"
import { shouldUseLocalBundle } from "@/src/infrastructure/fhir/client/fhir-client.service"
import { createUserMessage, createAgentState, formatChatMessageContentForAi } from "@/src/shared/utils/chat-message.utils"
import { useAuth } from "@/src/application/providers/auth.provider"
import { aiProviderFactory } from "@/src/infrastructure/ai/factories/ai-provider.factory"
import { getModelDefinition, gateModelForKeys } from "@/src/shared/constants/ai-models.constants"
import { buildAgentSystemPromptUseCase } from "@/src/core/use-cases/agent/build-agent-system-prompt.use-case"
import { runDeepModeAgent, type AgentRunEvent } from "@/src/infrastructure/ai/agent/run-deep-mode-agent"
import { resolveStreamIdleTimeoutMs } from "@/src/infrastructure/ai/streaming/stream-idle-timeout"
import { useChatHistoryStore } from "@/src/application/stores/chat-history.store"
import type { ChatReplyReference } from "@/src/core/entities/chat-message.entity"

export function useAgentChat(systemPrompt: string, modelId: string, onInputClear?: () => void, onStreamComplete?: () => void) {
  const chatMessages = useChatMessages()
  const setChatMessages = useSetChatMessages()
  const { apiKey: openAiKey, geminiKey, perplexityKey, claudeKey } = useAllApiKeys()
  const { patient } = usePatient()
  const { t } = useLanguage()
  const { user, isAnonymous } = useAuth()
  // The proxy accepts any Firebase token — a real account OR an anonymous
  // (free-tier) one. Gate proxy use on "we have a token", not "real account".
  const hasProxyAccess = !!user || isAnonymous
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const hasReceivedChunkRef = useRef(false)

  // Unified tool factory reads from the same ClinicalDataCollection cache
  // that the left-panel UI consumes — single implementation works for both
  // SMART live mode and local-bundle mode.
  const fhirTools = useFhirTools()
  const isLocalMode = shouldUseLocalBundle()
  const literatureTools = useLiteratureTools(perplexityKey)

  const tools = useMemo(() => {
    if (!fhirTools && !literatureTools) return undefined
    return {
      ...(fhirTools || {}),
      ...(literatureTools || {}),
    }
  }, [fhirTools, literatureTools])

  const handleSend = useCallback(
    async (input: string, images?: ChatImage[], replyTo?: ChatReplyReference | null) => {
      hasReceivedChunkRef.current = false
      const trimmed = input.trim()
      if (!trimmed && (!images || images.length === 0)) return

      // Graceful degradation: if the picked model needs a user key we don't have,
      // run on the free default instead of dead-ending with an error. Normal mode
      // gates the same way inside the ai-sdk-stream adapter; deep mode runs its
      // own streamText loop (runDeepModeAgent), so it must gate here too.
      const effectiveModelId = gateModelForKeys(modelId, { openAiKey, geminiKey, claudeKey })

      // Create user message with images
      const userMessage = createUserMessage(trimmed, images, replyTo)
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
        modelId: effectiveModelId,
        agentStates: [initialState],
      }])

      setIsLoading(true)
      setError(null)
      // Keep a local handle: the ref is nulled in `finally`, but late events /
      // pending timers still need to check THIS run's abort state.
      const abortController = new AbortController()
      abortControllerRef.current = abortController
      // Idle watchdog for every agent stream below: abort + surface a timeout
      // error if a stream stalls (same anti-hang guard as normal mode). Idle-
      // based, so legitimate long tool runs that keep emitting events are fine.
      const idleMs = resolveStreamIdleTimeoutMs()

      // Throttle state, declared OUTSIDE the try so catch/finally can clear a
      // still-pending timer — a leftover timer otherwise fired after abort or
      // error and overwrote the reset/❌ message with stale stream content.
      const UPDATE_INTERVAL = 100
      let lastUpdateTime = 0
      let timeoutId: NodeJS.Timeout | null = null
      let latestContent = ""
      const clearPending = () => {
        if (timeoutId) { clearTimeout(timeoutId); timeoutId = null }
      }

      try {
        const provider = getModelDefinition(effectiveModelId)?.provider ?? "openai"
        const apiKey =
          provider === 'gemini' ? geminiKey :
          provider === 'claude' ? claudeKey :
          openAiKey

        // Check if user can use deep mode
        if (!apiKey && !hasProxyAccess) {
          setChatMessages((prev) =>
            prev.map((m) => m.id === assistantMessageId ? { ...m, content: t.agent.apiKeyRequired } : m)
          )
          setIsLoading(false)
          return
        }

        // Validate proxy availability when there's no user key but we do have
        // a Firebase token (real or anonymous)
        const useProxy = !apiKey && hasProxyAccess
        if (useProxy) {
          const validation = aiProviderFactory.validateProxyAvailability(effectiveModelId)
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
          modelId: effectiveModelId,
          apiKey: apiKey || undefined,
          useProxy,
        })

        // Build enhanced system prompt using use case
        // Note: Clinical context is no longer automatically included
        // Users can choose to include it via the auto-include toggle (consistent with normal mode)
        // Literature search is available if user has Perplexity API key OR is authenticated (can use proxy)
        const hasLiteratureSearch = !!perplexityKey || hasProxyAccess
        const enhancedSystemPrompt = buildAgentSystemPromptUseCase.execute({
          baseSystemPrompt: systemPrompt,
          clinicalContext: '', // Empty - let user control via toggle
          hasPatient: !!patient?.id,
          mode: isLocalMode ? 'local' : 'live',
          hasPerplexityKey: hasLiteratureSearch,
          translations: t.agent.systemPrompt,
        })

        const apiMessages = [
          { role: "system" as const, content: enhancedSystemPrompt },
          ...newMessages.map((m) => ({
            role: m.role as "user" | "assistant",
            content: formatChatMessageContentForAi(m),
          })),
        ]

        // UI rendering for the headless agent core's events. The orchestration
        // (the three streamText rounds, tool handling, follow-up/synthesis,
        // citation processing) now lives in runDeepModeAgent so the eval harness
        // shares it; the only thing left here is mapping events → setChatMessages,
        // including the 100ms throttle that keeps high-frequency text deltas from
        // blocking the main thread.
        const setContent = (content: string) => {
          // A throttled timer can fire just after the user aborts — don't let
          // it resurrect content (e.g. over a cleared chat or reset message).
          if (abortController.signal.aborted) return
          setChatMessages((prev) =>
            prev.map((m) => m.id === assistantMessageId ? { ...m, content } : m)
          )
        }
        const appendState = (state: string, extra?: Partial<ChatMessage>) => {
          clearPending()
          setChatMessages((prev) =>
            prev.map((m) => m.id === assistantMessageId
              ? {
                  ...m,
                  content: state,
                  agentStates: [...(m.agentStates || []), { state, timestamp: Date.now() }],
                  ...extra,
                }
              : m)
          )
        }

        const onEvent = (event: AgentRunEvent) => {
          // After abort (stop button, reset, patient/bundle switch) the agent
          // core may still flush queued events — dropping them here prevents a
          // brief flash of the previous context's content in the UI.
          if (abortController.signal.aborted) return
          switch (event.type) {
            case 'content': {
              if (!hasReceivedChunkRef.current && onInputClear) {
                hasReceivedChunkRef.current = true
                onInputClear()
              }
              latestContent = event.content
              const now = Date.now()
              if (now - lastUpdateTime >= UPDATE_INTERVAL) {
                lastUpdateTime = now
                setContent(latestContent)
              } else if (!timeoutId) {
                timeoutId = setTimeout(() => {
                  lastUpdateTime = Date.now()
                  setContent(latestContent)
                  timeoutId = null
                }, UPDATE_INTERVAL - (now - lastUpdateTime))
              }
              break
            }
            case 'status':
              appendState(event.state)
              break
            case 'tool-call':
              appendState(event.state, { toolCalls: event.toolCalls })
              break
            case 'final':
              clearPending()
              setChatMessages((prev) =>
                prev.map((m) => m.id === assistantMessageId
                  ? { ...m, content: event.content, toolCalls: event.toolCalls.length > 0 ? event.toolCalls : undefined }
                  : m)
              )
              break
            case 'tool-result':
              break
          }
        }

        await runDeepModeAgent({
          model,
          messages: apiMessages,
          tools,
          idleMs,
          abortController,
          onEvent,
          translations: {
            organizingResults: t.agent.organizingResults,
            queriedFhirData: t.agent.queriedFhirData,
            answerQuestion: t.agent.answerQuestion,
            answerQuestionCitationsHint: (t.agent as any).answerQuestionCitationsHint,
            synthesizeResults: t.agent.synthesizeResults,
            queryResult: t.agent.queryResult,
            queryFailed: t.agent.queryFailed,
            noData: t.agent.noData,
            noDataFound: t.agent.noDataFound,
            foundRecords: t.agent.foundRecords,
            toolNames: t.agent.toolNames,
          },
        })
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return
        
        const errorMessage = getUserErrorMessage(err)
        const errorObj = new Error(errorMessage)
        setError(errorObj)
        setChatMessages((prev) =>
          prev.map((m) => m.id === assistantMessageId ? { ...m, content: `❌ ${errorMessage}` } : m)
        )
      } finally {
        clearPending()
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
    [chatMessages, modelId, openAiKey, geminiKey, claudeKey, patient, setChatMessages, systemPrompt, onInputClear, onStreamComplete, tools, hasProxyAccess, perplexityKey, t, isLocalMode]
  )

  const handleReset = useCallback(() => {
    abortControllerRef.current?.abort()
    setChatMessages([])
    useChatHistoryStore.getState().setCurrentSessionId(null)
  }, [setChatMessages])

  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort()
    setIsLoading(false)
  }, [])

  return { messages: chatMessages, isLoading, error, handleSend, handleReset, stopGeneration }
}
