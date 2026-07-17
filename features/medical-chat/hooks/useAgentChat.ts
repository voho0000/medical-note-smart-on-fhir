// Agent Chat Hook - Refactored
"use client"

import { useState, useCallback, useRef, useMemo } from "react"
import { useChatMessages, useSetChatMessages, type ChatMessage, type ChatImage } from "@/src/application/stores/chat.store"
import { useAllApiKeys } from "@/src/application/stores/ai-config.store"
import { usePatient } from "@/src/application/hooks/patient/use-patient-query.hook"
import { useClinicalContext } from "@/src/application/hooks/use-clinical-context.hook"
import { getUserErrorMessage } from "@/src/core/errors"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useFhirTools } from "@/src/application/hooks/ai/use-fhir-tools.hook"
import { useLiteratureTools } from "@/src/application/hooks/ai/use-literature-tools.hook"
import { shouldUseLocalBundle } from "@/src/infrastructure/fhir/client/fhir-client.service"
import { createUserMessage, createAgentState, formatChatMessageContentForAi } from "@/src/shared/utils/chat-message.utils"
import { useAuth } from "@/src/application/providers/auth.provider"
import { aiProviderFactory } from "@/src/infrastructure/ai/factories/ai-provider.factory"
import {
  CUSTOM_OPENAI_MODEL_ID,
  getModelDefinition,
  gateModelForKeys,
} from "@/src/shared/constants/ai-models.constants"
import { buildAgentSystemPromptUseCase } from "@/src/core/use-cases/agent/build-agent-system-prompt.use-case"
import { buildStandardChatSystemPrompt } from "@/src/core/use-cases/chat/build-standard-chat-system-prompt.use-case"
import { runDeepModeAgent, type AgentRunEvent } from "@/src/infrastructure/ai/agent/run-deep-mode-agent"
import { resolveStreamIdleTimeoutMs } from "@/src/infrastructure/ai/streaming/stream-idle-timeout"
import { AiSdkStreamAdapter } from "@/src/infrastructure/ai/streaming/ai-sdk-stream.adapter"
import { OPENAI_COMPATIBLE_QUERY_TIMEOUT_MS } from "@/src/infrastructure/ai/services/openai-compatible.service"
import { useChatHistoryStore } from "@/src/application/stores/chat-history.store"
import type { ChatReplyReference } from "@/src/core/entities/chat-message.entity"
import { buildPatientTextLiterals, scrubFreeText } from "@/src/shared/utils/pii-text-scrub"
import { isOpenAiCompatibleReady } from '@/src/shared/utils/openai-compatible.utils'
import {
  apiKeyForModel,
  hasDirectModelAccess,
  modelContextLimit,
} from '@/src/shared/utils/model-access.utils'
import { truncateToContextWindow } from '@/src/shared/utils/context-window-manager'

const standardChatStream = new AiSdkStreamAdapter()

export function useAgentChat(systemPrompt: string, modelId: string, onInputClear?: () => void, onStreamComplete?: () => void) {
  const chatMessages = useChatMessages()
  const setChatMessages = useSetChatMessages()
  const {
    apiKey: openAiKey,
    geminiKey,
    perplexityKey,
    claudeKey,
    openAiCompatible,
  } = useAllApiKeys()
  const { patient } = usePatient()
  // A tool-less local model cannot fetch FHIR records on demand. Give standard
  // chat the exact same user-selected, PII-scrubbed snapshot used by summaries.
  const { getFullClinicalContext } = useClinicalContext('insights')
  const selectedClinicalContext = useMemo(
    () => getFullClinicalContext(),
    [getFullClinicalContext],
  )
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
  const patientTextLiterals = useMemo(() => buildPatientTextLiterals(patient), [patient])

  const tools = useMemo(() => {
    // Hospital/local models run in explicit standard-chat mode: no tool schema
    // is sent at all. This both avoids unsupported function calling and keeps
    // literature search from becoming an auxiliary cloud recipient.
    if (modelId === CUSTOM_OPENAI_MODEL_ID) return undefined
    if (!fhirTools && !literatureTools) return undefined
    return {
      ...(fhirTools || {}),
      ...(literatureTools || {}),
    }
  }, [fhirTools, literatureTools, modelId])

  const handleSend = useCallback(
    async (input: string, images?: ChatImage[], replyTo?: ChatReplyReference | null) => {
      hasReceivedChunkRef.current = false
      const trimmed = input.trim()
      if (!trimmed && (!images || images.length === 0)) return

      // Graceful degradation: if the picked model needs a user key we don't have,
      // run on the free default instead of dead-ending with an error. Normal mode
      // gates the same way inside the ai-sdk-stream adapter; agent chat runs its
      // own streamText loop (runDeepModeAgent), so it must gate here too.
      const effectiveModelId = gateModelForKeys(modelId, {
        openAiKey,
        geminiKey,
        claudeKey,
        customAvailable: isOpenAiCompatibleReady(openAiCompatible),
      })

      // Create user message with images
      const userMessage = createUserMessage(trimmed, images, replyTo)
      const newMessages = [...chatMessages, userMessage]
      setChatMessages(newMessages)

      // Create assistant message with thinking state
      const assistantMessageId = crypto.randomUUID()
      const thinkingMessage = `🤔 ${t.agent.thinking}`
      const initialState = createAgentState(thinkingMessage)
      const isStandardChat = effectiveModelId === CUSTOM_OPENAI_MODEL_ID
      
      setChatMessages([...newMessages, {
        id: assistantMessageId,
        role: "assistant",
        content: thinkingMessage,
        timestamp: Date.now(),
        modelId: effectiveModelId,
        agentStates: isStandardChat ? undefined : [initialState],
      }])

      setIsLoading(true)
      setError(null)
      // Keep a local handle: the ref is nulled in `finally`, but late events /
      // pending timers still need to check THIS run's abort state.
      const abortController = new AbortController()
      abortControllerRef.current = abortController
      // Idle watchdog for every agent stream below: abort + surface a timeout
      // error if a stream stalls. Idle-
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
      const setContent = (content: string) => {
        // A throttled timer can fire just after the user aborts — don't let it
        // resurrect content over a cleared chat or reset message.
        if (abortController.signal.aborted) return
        setChatMessages((prev) =>
          prev.map((m) => m.id === assistantMessageId ? { ...m, content } : m)
        )
      }

      try {
        const provider = getModelDefinition(effectiveModelId)?.provider ?? "openai"
        const apiKey = apiKeyForModel(
          effectiveModelId,
          { openAiKey, geminiKey, claudeKey },
          openAiCompatible,
        )
        const hasDirectAccess = hasDirectModelAccess(
          effectiveModelId,
          { openAiKey, geminiKey, claudeKey },
          openAiCompatible,
        )
        const isCustomEndpoint = provider === 'custom'

        // Check if the user can access agent chat.
        if (!hasDirectAccess && (!hasProxyAccess || isCustomEndpoint)) {
          setChatMessages((prev) =>
            prev.map((m) => m.id === assistantMessageId
              ? {
                  ...m,
                  content: isCustomEndpoint
                    ? t.settings.openAiCompatibleNotConfigured
                    : t.agent.apiKeyRequired,
                }
              : m)
          )
          setIsLoading(false)
          return
        }

        if (isCustomEndpoint) {
          // Standard chat deliberately sends no `tools` field. It answers from
          // the user-selected clinical snapshot instead of pretending it can
          // query the complete FHIR record or current literature on demand.
          const localSystemPrompt = buildStandardChatSystemPrompt(
            systemPrompt,
            selectedClinicalContext,
          )
          const localHistory = newMessages.map((message) => ({
            role: message.role as 'user' | 'assistant',
            content: message.role === 'user'
              ? scrubFreeText(formatChatMessageContentForAi(message), patientTextLiterals)
              : formatChatMessageContentForAi(message),
            ...(message.role === 'user' && message.images?.length
              ? { images: message.images.map((image) => ({ data: image.data })) }
              : {}),
          }))
          const boundedHistory = truncateToContextWindow(localHistory, {
            modelId: effectiveModelId,
            systemPrompt: localSystemPrompt,
            maxResponseTokens: 4000,
            contextLimit: modelContextLimit(effectiveModelId, openAiCompatible),
          })
          if (boundedHistory.length === 0) {
            throw new Error(t.medicalChat.localStandardContextTooLarge)
          }

          await standardChatStream.stream({
            messages: [
              { role: 'system', content: localSystemPrompt },
              ...boundedHistory,
            ],
            model: effectiveModelId,
            apiKey,
            openAiCompatible,
            signal: abortController.signal,
            // A local 7B model may spend minutes evaluating the selected chart
            // before its first token. Continuous output resets this idle timer.
            idleTimeoutMs: OPENAI_COMPATIBLE_QUERY_TIMEOUT_MS,
            onChunk: (content) => {
              if (!hasReceivedChunkRef.current && onInputClear) {
                hasReceivedChunkRef.current = true
                onInputClear()
              }
              setContent(content)
            },
          })
          return
        }

        // Validate proxy availability when there's no user key but we do have
        // a Firebase token (real or anonymous)
        const useProxy = !isCustomEndpoint && !apiKey && hasProxyAccess
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
          openAiCompatible,
        })

        // Build the agent prompt without preloading a formatted patient record;
        // the agent queries the bound FHIR tools only when the question needs it.
        // Literature search is available if user has Perplexity API key OR is authenticated (can use proxy)
        const hasLiteratureSearch = !isCustomEndpoint && (!!perplexityKey || hasProxyAccess)
        const enhancedSystemPrompt = buildAgentSystemPromptUseCase.execute({
          baseSystemPrompt: systemPrompt,
          clinicalContext: '',
          hasPatient: !!patient?.id,
          mode: isLocalMode ? 'local' : 'live',
          hasPerplexityKey: hasLiteratureSearch,
          translations: t.agent.systemPrompt,
        })

        const apiMessages = [
          { role: "system" as const, content: enhancedSystemPrompt },
          ...newMessages.map((m) => ({
            role: m.role as "user" | "assistant",
            // Keep the original message in the UI/history, but mask identifying
            // text in user-authored content before it leaves the browser.
            content: m.role === "user"
              ? scrubFreeText(formatChatMessageContentForAi(m), patientTextLiterals)
              : formatChatMessageContentForAi(m),
          })),
        ]

        // UI rendering for the headless agent core's events. The orchestration
        // (the three streamText rounds, tool handling, follow-up/synthesis,
        // citation processing) now lives in runDeepModeAgent so the eval harness
        // shares it; the only thing left here is mapping events → setChatMessages,
        // including the 100ms throttle that keeps high-frequency text deltas from
        // blocking the main thread.
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
    [chatMessages, modelId, openAiKey, geminiKey, claudeKey, openAiCompatible, patient, patientTextLiterals, selectedClinicalContext, setChatMessages, systemPrompt, onInputClear, onStreamComplete, tools, hasProxyAccess, perplexityKey, t, isLocalMode]
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
