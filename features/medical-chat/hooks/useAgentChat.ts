// Agent Chat Hook - Refactored
"use client"

import { useState, useCallback, useEffect, useRef, useMemo } from "react"
import { toast } from "sonner"
import {
  useChatMessages,
  useSetChatMessages,
  type ChatDataScope,
  type ChatMessage,
  type ChatImage,
} from "@/src/application/stores/chat.store"
import { useAiConfigStore, useAllApiKeys } from "@/src/application/stores/ai-config.store"
import { usePatient } from "@/src/application/hooks/patient/use-patient-query.hook"
import { useClinicalAiInput } from "@/src/application/hooks/ai-generation/use-clinical-ai-input.hook"
import { getUserErrorMessage } from "@/src/core/errors"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useFhirTools } from "@/src/application/hooks/ai/use-fhir-tools.hook"
import { useLiteratureTools } from "@/src/application/hooks/ai/use-literature-tools.hook"
import { shouldUseLocalBundle } from "@/src/infrastructure/fhir/client/fhir-client.service"
import { createUserMessage, createAgentState, formatChatMessageContentForAi } from "@/src/shared/utils/chat-message.utils"
import { useAuth } from "@/src/application/providers/auth.provider"
import {
  getModelDefinition,
  getModelDefinitionOrThrow,
  gateModelForKeys,
  isCustomOpenAiModelId,
  modelUsesStandardChat,
} from "@/src/shared/constants/ai-models.constants"
import { buildAgentSystemPromptUseCase } from "@/src/core/use-cases/agent/build-agent-system-prompt.use-case"
import { buildStandardChatSystemPrompt } from "@/src/core/use-cases/chat/build-standard-chat-system-prompt.use-case"
import { runDeepModeAgent, type AgentRunEvent } from "@/src/infrastructure/ai/agent/run-deep-mode-agent"
import {
  asksForCurrentMedicalEvidence,
  filterAgentToolsForDataScope,
  forcedInitialAgentToolName,
  localAgentPrefetchInput,
  selectAgentToolsForQuestion,
  shouldPreExecuteLocalAgentTool,
} from '@/src/infrastructure/ai/tools/agent-tool-router'
import { resolveStreamIdleTimeoutMs } from "@/src/infrastructure/ai/streaming/stream-idle-timeout"
import { OPENAI_COMPATIBLE_QUERY_TIMEOUT_MS } from "@/src/infrastructure/ai/services/openai-compatible.service"
import {
  createAiProvider,
  createAiStreamOrchestrator,
  validateAiProxyAvailability,
} from '@/src/application/composition.ai'
import { useChatHistoryStore } from "@/src/application/stores/chat-history.store"
import type { ChatReplyReference } from "@/src/core/entities/chat-message.entity"
import { buildPatientTextLiterals, scrubFreeText } from "@/src/shared/utils/pii-text-scrub"
import {
  isOpenAiCompatibleRuntimeReady,
  resolveOpenAiCompatibleConversationMode,
  resolveOpenAiCompatibleProfile,
} from '@/src/shared/utils/openai-compatible.utils'
import {
  apiKeyForModel,
  hasDirectModelAccess,
  modelContextLimit,
} from '@/src/shared/utils/model-access.utils'
import { truncateToContextWindow } from '@/src/shared/utils/context-window-manager'
import type { OpenAiCompatibleProfile } from '@/src/shared/types/openai-compatible.types'
import { formatClinicalContextAdaptationNotice } from '@/src/core/utils/adaptive-clinical-context.utils'
import type { MedicalChatExecutionRecord } from '@/features/medical-chat/utils/ai-execution-export'

const standardChatStream = createAiStreamOrchestrator()

interface ActiveChatRequest {
  controller: AbortController
  modelId: string
  openAiCompatible: OpenAiCompatibleProfile | null
}

function usesStandardChat(
  modelId: string,
  openAiCompatible: OpenAiCompatibleProfile | null,
): boolean {
  return isCustomOpenAiModelId(modelId)
    ? resolveOpenAiCompatibleConversationMode(openAiCompatible) === 'standard'
    : modelUsesStandardChat(modelId)
}

function messageCanEnterScope(
  message: ChatMessage,
  dataScope: ChatDataScope,
  hasPatient: boolean,
): boolean {
  if (dataScope === 'auto') return true
  if (dataScope === 'general') {
    // An untagged legacy transcript may contain patient data. It is safe to
    // retain only when no patient is loaded in this conversation partition.
    return message.dataScope === 'general' || (!message.dataScope && !hasPatient)
  }
  if (dataScope === 'patient') {
    // Do not carry literature-derived answers back into patient-only mode.
    return message.dataScope === 'patient' || (!message.dataScope && hasPatient)
  }
  // Combined mode authorizes automatic, patient-only, and combined prior turns.
  if (message.dataScope === 'auto') return true
  return message.dataScope === 'patient' ||
    message.dataScope === 'patient-literature' ||
    (!message.dataScope && hasPatient)
}

export function useAgentChat(
  systemPrompt: string,
  modelId: string,
  onInputClear?: () => void,
  onStreamComplete?: () => void,
  dataScope: ChatDataScope = 'patient',
) {
  const chatMessages = useChatMessages()
  const setChatMessages = useSetChatMessages()
  const {
    apiKey,
    geminiKey,
    claudeKey,
    perplexityKey,
    openAiCompatibleProfiles,
  } = useAllApiKeys()
  const { patient } = usePatient()
  // A tool-less local model cannot fetch FHIR records on demand. Give standard
  // chat the same model-fitted, PII-scrubbed snapshot used by summaries.
  const selectedOpenAiCompatible = resolveOpenAiCompatibleProfile(
    modelId,
    openAiCompatibleProfiles,
  )
  const contextModelId = gateModelForKeys(modelId, {
    openAiKey: apiKey,
    geminiKey,
    claudeKey,
    customAvailable: isOpenAiCompatibleRuntimeReady(selectedOpenAiCompatible),
  })
  const contextOpenAiCompatible = resolveOpenAiCompatibleProfile(
    contextModelId,
    openAiCompatibleProfiles,
  )
  const fittedClinicalInput = useClinicalAiInput(
    modelContextLimit(contextModelId, contextOpenAiCompatible),
  )
  const selectedClinicalContext = fittedClinicalInput.clinicalContext
  const { t, locale } = useLanguage()
  const { user, isAnonymous } = useAuth()
  // The proxy accepts any Firebase token — a real account OR an anonymous
  // (free-tier) one. Gate proxy use on "we have a token", not "real account".
  const hasProxyAccess = !!user || isAnonymous
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [latestExecution, setLatestExecution] = useState<MedicalChatExecutionRecord | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const activeRequestRef = useRef<ActiveChatRequest | null>(null)
  const mountedRef = useRef(true)
  const hasReceivedChunkRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    const unsubscribe = useAiConfigStore.subscribe((state, previousState) => {
      if (state.openAiCompatibleProfiles === previousState.openAiCompatibleProfiles) return
      const active = activeRequestRef.current
      if (!active || !isCustomOpenAiModelId(active.modelId)) return
      const liveProfile = resolveOpenAiCompatibleProfile(
        active.modelId,
        state.openAiCompatibleProfiles,
      )
      if (
        liveProfile !== active.openAiCompatible ||
        !isOpenAiCompatibleRuntimeReady(liveProfile)
      ) {
        active.controller.abort()
      }
    })

    return () => {
      mountedRef.current = false
      unsubscribe()
      activeRequestRef.current?.controller.abort()
      activeRequestRef.current = null
      abortControllerRef.current = null
    }
  }, [])

  // Unified tool factory reads from the same ClinicalDataCollection cache
  // that the left-panel UI consumes — single implementation works for both
  // SMART live mode and local-bundle mode.
  const fhirTools = useFhirTools()
  const isLocalMode = shouldUseLocalBundle()
  const literatureTools = useLiteratureTools(perplexityKey)
  const patientTextLiterals = useMemo(() => buildPatientTextLiterals(patient), [patient])

  const cloudAgentTools = useMemo(() => {
    if (!fhirTools && !literatureTools) return undefined
    return {
      ...(fhirTools || {}),
      ...(literatureTools || {}),
    }
  }, [fhirTools, literatureTools])

  const handleSend = useCallback(
    async (input: string, images?: ChatImage[], replyTo?: ChatReplyReference | null) => {
      if (!mountedRef.current) return
      hasReceivedChunkRef.current = false
      const trimmed = input.trim()
      if (!trimmed && (!images || images.length === 0)) return

      // A callback captured by the chat input can outlive the render that
      // created it. Resolve credentials and the exact custom profile from the
      // live store at the request boundary so deleted/disabled endpoints never
      // fall through to an older snapshot.
      const liveConfig = useAiConfigStore.getState()
      const requestedOpenAiCompatible = resolveOpenAiCompatibleProfile(
        modelId,
        liveConfig.openAiCompatibleProfiles,
      )

      // Graceful degradation: if the picked model needs a user key we don't have,
      // run on the free default instead of dead-ending with an error. Normal mode
      // gates the same way inside the ai-sdk-stream adapter; agent chat runs its
      // own streamText loop (runDeepModeAgent), so it must gate here too.
      const effectiveModelId = gateModelForKeys(modelId, {
        openAiKey: liveConfig.apiKey,
        geminiKey: liveConfig.geminiKey,
        claudeKey: liveConfig.claudeKey,
        customAvailable: isOpenAiCompatibleRuntimeReady(requestedOpenAiCompatible),
      })
      const openAiCompatible = resolveOpenAiCompatibleProfile(
        effectiveModelId,
        liveConfig.openAiCompatibleProfiles,
      )
      const isCustomEndpoint = isCustomOpenAiModelId(effectiveModelId)
      // Custom profiles opt into Agent execution per endpoint. Automatic mode
      // stays tool-less until the patient-free tool-call probe is verified;
      // automatic verification and an explicit standard-chat selection are
      // resolved by the same helper.
      const isStandardChat = usesStandardChat(effectiveModelId, openAiCompatible)
      // A custom/hospital Agent may query the browser-bound FHIR tools, but it
      // does not receive the external literature tool. This preserves the
      // custom endpoint's existing no-auxiliary-cloud privacy boundary.
      const agentTools = isCustomEndpoint ? fhirTools : cloudAgentTools

      // The runtime default plus the user's explicit no-patient-data override
      // resolve the scope. If no patient is loaded, fail closed to the
      // patient-free boundary.
      const hasPatient = !!patient?.id
      const endpointScope: ChatDataScope = isCustomEndpoint && dataScope === 'auto'
        ? (hasPatient ? 'patient' : 'general')
        : dataScope
      const turnDataScope: ChatDataScope = endpointScope !== 'general' &&
        endpointScope !== 'auto' &&
        !hasPatient
        ? 'general'
        : endpointScope

      const requestTimestamp = new Date().toISOString()
      const modelDefinition = getModelDefinition(effectiveModelId)
      const modelName = isCustomEndpoint
        ? openAiCompatible?.modelId.trim() || modelDefinition?.label || effectiveModelId
        : modelDefinition?.label || effectiveModelId
      let executionPrompt = systemPrompt
      let executionInput: unknown = []
      let executionOutput = ''
      const recordExecution = (
        status: MedicalChatExecutionRecord['status'],
        errorMessage: string | null = null,
      ) => {
        if (!mountedRef.current) return
        setLatestExecution({
          version: 1,
          feature: 'medical-chat',
          modelName,
          modelId: effectiveModelId,
          timestamp: requestTimestamp,
          prompt: executionPrompt,
          inputData: executionInput,
          outputData: executionOutput,
          hasError: status === 'error',
          errorMessage,
          status,
        })
      }

      // Create user message with images
      const replySource = replyTo
        ? chatMessages.find((message) => message.id === replyTo.messageId)
        : undefined
      const scopedReply = replySource && messageCanEnterScope(replySource, turnDataScope, hasPatient)
        ? replyTo
        : null
      const userMessage: ChatMessage = {
        ...createUserMessage(trimmed, images, scopedReply),
        dataScope: turnDataScope,
      }
      const newMessages = [...chatMessages, userMessage]
      const scopedConversation = [
        ...chatMessages.filter((message) => messageCanEnterScope(
          message,
          turnDataScope,
          hasPatient,
        )),
        userMessage,
      ]
      executionInput = scopedConversation.map((message) => ({
        role: message.role,
        content: message.role === 'user'
          ? scrubFreeText(formatChatMessageContentForAi(message), patientTextLiterals)
          : formatChatMessageContentForAi(message),
      }))
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
        dataScope: turnDataScope,
        agentStates: isStandardChat ? undefined : [initialState],
      }])

      setIsLoading(true)
      setError(null)
      // Keep a local handle: the ref is nulled in `finally`, but late events /
      // pending timers still need to check THIS run's abort state.
      const abortController = new AbortController()
      abortControllerRef.current = abortController
      activeRequestRef.current = {
        controller: abortController,
        modelId: effectiveModelId,
        openAiCompatible,
      }
      // Idle watchdog for every agent stream below: abort + surface a timeout
      // error if a stream stalls. Idle-
      // based, so legitimate long tool runs that keep emitting events are fine.
      const idleMs = isCustomEndpoint
        ? OPENAI_COMPATIBLE_QUERY_TIMEOUT_MS
        : resolveStreamIdleTimeoutMs()

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
        const provider = getModelDefinitionOrThrow(effectiveModelId).provider
        const apiKey = apiKeyForModel(
          effectiveModelId,
          {
            openAiKey: liveConfig.apiKey,
            geminiKey: liveConfig.geminiKey,
            claudeKey: liveConfig.claudeKey,
          },
          openAiCompatible,
        )
        const hasDirectAccess = hasDirectModelAccess(
          effectiveModelId,
          {
            openAiKey: liveConfig.apiKey,
            geminiKey: liveConfig.geminiKey,
            claudeKey: liveConfig.claudeKey,
          },
          openAiCompatible,
        )
        if (isCustomEndpoint !== (provider === 'custom')) {
          throw new Error('Custom model profile does not match its provider definition')
        }

        // Check if the user can access agent chat.
        if (!hasDirectAccess && (!hasProxyAccess || isCustomEndpoint)) {
          const unavailableMessage = isCustomEndpoint
            ? t.settings.openAiCompatibleNotConfigured
            : t.agent.apiKeyRequired
          setChatMessages((prev) =>
            prev.map((m) => m.id === assistantMessageId
              ? {
                  ...m,
                  content: unavailableMessage,
                }
              : m)
          )
          recordExecution('error', unavailableMessage)
          setIsLoading(false)
          return
        }

        if (isStandardChat) {
          const includesPatientContext = turnDataScope !== 'general'
          if (includesPatientContext && !fittedClinicalInput.dataReady) {
            throw new Error(t.medicalChat.localStandardContextTooLarge)
          }
          if (includesPatientContext && fittedClinicalInput.contextAdaptation) {
            toast.info(
              formatClinicalContextAdaptationNotice(
                fittedClinicalInput.contextAdaptation,
                locale,
              ),
              {
                id: `clinical-context-fit:chat:${fittedClinicalInput.inputSignature}:${fittedClinicalInput.contextAdaptation.tier}`,
              },
            )
          }
          // Standard chat deliberately sends no `tools` field. It answers from
          // the user-selected clinical snapshot instead of pretending it can
          // query the complete FHIR record or current literature on demand.
          const localSystemPrompt = buildStandardChatSystemPrompt(
            systemPrompt,
            includesPatientContext ? selectedClinicalContext : '',
            turnDataScope,
          )
          const localHistory = scopedConversation.map((message) => ({
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

          executionPrompt = localSystemPrompt
          executionInput = boundedHistory

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
            ...(isCustomEndpoint
              ? { idleTimeoutMs: OPENAI_COMPATIBLE_QUERY_TIMEOUT_MS }
              : {}),
            ...(isCustomEndpoint && /^gpt-oss(?::|-)/i.test(openAiCompatible?.modelId.trim() ?? '')
              ? { reasoningEffort: 'low' as const }
              : {}),
            onChunk: (content) => {
              executionOutput = content
              if (!hasReceivedChunkRef.current && onInputClear) {
                hasReceivedChunkRef.current = true
                onInputClear()
              }
              setContent(content)
            },
          })
          recordExecution('completed')
          return
        }

        // Validate proxy availability when there's no user key but we do have
        // a Firebase token (real or anonymous)
        const useProxy = !isCustomEndpoint && !apiKey && hasProxyAccess
        if (useProxy) {
          const validation = validateAiProxyAvailability(effectiveModelId)
          if (!validation.available) {
            const unavailableMessage = validation.error || t.agent.apiKeyRequired
            setChatMessages((prev) =>
              prev.map((m) => m.id === assistantMessageId ? { ...m, content: unavailableMessage } : m)
            )
            recordExecution('error', unavailableMessage)
            setIsLoading(false)
            return
          }
        }

        // Create AI provider using factory
        const { model } = createAiProvider({
          modelId: effectiveModelId,
          apiKey: apiKey || undefined,
          useProxy,
          openAiCompatible,
        })

        const latestUserQuestion = [...newMessages]
          .reverse()
          .find((message) => message.role === 'user')
        const routingQuestion = latestUserQuestion
          ? formatChatMessageContentForAi(latestUserQuestion)
          : ''
        // The resolved scope filters data sources for every model. Smaller
        // custom models receive an additional relevance pass to reduce schema
        // tokens; frontier models keep all schemas inside the runtime boundary.
        const toolDataScope: ChatDataScope = turnDataScope === 'auto' && !hasPatient
          ? 'general'
          : turnDataScope
        const toolsForTurn = isCustomEndpoint
          ? selectAgentToolsForQuestion(agentTools, routingQuestion, turnDataScope)
          : filterAgentToolsForDataScope(agentTools, toolDataScope)
        const initialToolName = isCustomEndpoint
          ? forcedInitialAgentToolName(
              routingQuestion,
              Object.keys(toolsForTurn ?? {}),
              turnDataScope,
            )
          : undefined

        // Build the agent prompt without preloading a formatted patient record;
        // the agent queries the bound FHIR tools only when the question needs it.
        // Literature search is available if user has Perplexity API key OR is authenticated (can use proxy)
        const hasLiteratureSearch = 'searchMedicalLiterature' in (toolsForTurn ?? {})
        const enhancedSystemPrompt = buildAgentSystemPromptUseCase.execute({
          baseSystemPrompt: systemPrompt,
          clinicalContext: '',
          hasPatient: !!patient?.id,
          mode: isLocalMode ? 'local' : 'live',
          hasPerplexityKey: hasLiteratureSearch,
          availableToolNames: Object.keys(toolsForTurn ?? {}),
          turnDataScope,
          currentEvidenceUnavailable: asksForCurrentMedicalEvidence(routingQuestion) &&
            !hasLiteratureSearch,
          translations: t.agent.systemPrompt,
        })

        const apiMessages = [
          { role: "system" as const, content: enhancedSystemPrompt },
          ...scopedConversation.map((m) => ({
            role: m.role as "user" | "assistant",
            // Keep the original message in the UI/history, but mask identifying
            // text in user-authored content before it leaves the browser.
            content: m.role === "user"
              ? scrubFreeText(formatChatMessageContentForAi(m), patientTextLiterals)
              : formatChatMessageContentForAi(m),
          })),
        ]
        executionPrompt = enhancedSystemPrompt
        executionInput = apiMessages.slice(1)

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
              executionOutput = event.content
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
              executionOutput = event.content
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

        const agentResult = await runDeepModeAgent({
          model,
          messages: apiMessages,
          tools: toolsForTurn,
          initialToolName,
          preExecuteInitialTool: isCustomEndpoint && shouldPreExecuteLocalAgentTool(initialToolName),
          preExecuteInitialToolInput: isCustomEndpoint
            ? localAgentPrefetchInput(routingQuestion, initialToolName)
            : undefined,
          ...(isCustomEndpoint && /^gpt-oss(?::|-)/i.test(openAiCompatible?.modelId.trim() ?? '')
            ? { reasoningEffort: 'low' as const }
            : {}),
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
        executionOutput = agentResult.answer
        executionInput = {
          messages: apiMessages.slice(1),
          toolTrajectory: agentResult.trajectory,
        }
        recordExecution('completed')
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          recordExecution('aborted')
          return
        }
        
        const errorMessage = getUserErrorMessage(err)
        recordExecution('error', errorMessage)
        const errorObj = new Error(errorMessage)
        setError(errorObj)
        setChatMessages((prev) =>
          prev.map((m) => m.id === assistantMessageId ? { ...m, content: `❌ ${errorMessage}` } : m)
        )
      } finally {
        clearPending()
        if (mountedRef.current) setIsLoading(false)
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null
        }
        if (activeRequestRef.current?.controller === abortController) {
          activeRequestRef.current = null
        }

        // Trigger save after agent completes
        if (mountedRef.current && onStreamComplete) {
          try {
            await onStreamComplete()
          } catch (error) {
            console.error('[Agent] onStreamComplete callback failed:', error)
          }
        }
      }
    },
    [chatMessages, modelId, patient, patientTextLiterals, selectedClinicalContext, fittedClinicalInput.dataReady, fittedClinicalInput.contextAdaptation, fittedClinicalInput.inputSignature, setChatMessages, systemPrompt, onInputClear, onStreamComplete, cloudAgentTools, fhirTools, hasProxyAccess, t, locale, isLocalMode, dataScope]
  )

  const handleReset = useCallback(() => {
    abortControllerRef.current?.abort()
    setChatMessages([])
    setLatestExecution(null)
    useChatHistoryStore.getState().setCurrentSessionId(null)
  }, [setChatMessages])

  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort()
    setIsLoading(false)
  }, [])

  return {
    messages: chatMessages,
    isLoading,
    error,
    latestExecution,
    handleSend,
    handleReset,
    stopGeneration,
  }
}
