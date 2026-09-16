import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '@/src/application/providers/auth.provider'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useChatStore } from '@/src/application/stores/chat.store'
import { useChatHistoryStore } from '@/src/application/stores/chat-history.store'
import { useUpdateSessionMutation } from './use-chat-sessions-query.hook'
import { useFhirContext } from './use-fhir-context.hook'
import { getChatSessionRepository } from '@/src/application/composition.chat'
import {
  captureAiRuntimeConfig,
  createSmartTitleUseCase,
} from '@/src/application/composition.ai'
import { usePatient } from '@/src/application/hooks/patient/use-patient-query.hook'
import { buildPatientTextLiterals, scrubFreeText } from '@/src/shared/utils/pii-text-scrub'

const repository = getChatSessionRepository()

export function useSmartTitleGeneration(options: { enabled?: boolean; isStreaming?: boolean } = {}) {
  const enabled = options.enabled ?? true
  const isStreaming = options.isStreaming ?? false
  const { user } = useAuth()
  const { locale } = useLanguage()
  const { patientId, fhirServerUrl } = useFhirContext()
  const { patient } = usePatient()
  const piiLiterals = useMemo(() => buildPatientTextLiterals(patient), [patient])
  const messages = useChatStore(state => state.messages)
  const currentSessionId = useChatHistoryStore(state => state.currentSessionId)
  const setIsTitleGenerating = useChatHistoryStore(state => state.setIsTitleGenerating)
  const { updateSession } = useUpdateSessionMutation()
  const generatedSessionsRef = useRef<Set<string>>(new Set())
  const pendingConversationRef = useRef<string | null>(null)
  const activeGenerationRef = useRef<{
    sessionId: string
    revision: number
  } | null>(null)
  const generationGateRef = useRef({ enabled, revision: 0 })

  /* eslint-disable react-hooks/refs -- This is a synchronous privacy gate.
   * A render that switches to a custom endpoint must invalidate an in-flight
   * cloud-title task before any passive effect or awaited continuation can
   * write the transcript-derived title to Firestore. */
  if (generationGateRef.current.enabled !== enabled) {
    generationGateRef.current = {
      enabled,
      revision: generationGateRef.current.revision + 1,
    }
  }
  /* eslint-enable react-hooks/refs */

  useEffect(() => {
    if (enabled) return
    if (!activeGenerationRef.current) return
    activeGenerationRef.current = null
    setIsTitleGenerating(false)
  }, [enabled, setIsTitleGenerating])

  const generateSmartTitle = useCallback(async (
    sessionId: string,
    userId: string,
    userMessage: string,
    assistantMessage: string,
    locale: string,
    generationRevision: number,
  ) => {
    const generation = { sessionId, revision: generationRevision }
    const isGenerationActive = () => {
      const gate = generationGateRef.current
      return gate.enabled &&
        gate.revision === generationRevision &&
        useChatHistoryStore.getState().currentSessionId === sessionId
    }

    if (!isGenerationActive()) return
    activeGenerationRef.current = generation

    try {
      setIsTitleGenerating(true)

      const useCase = createSmartTitleUseCase(captureAiRuntimeConfig())
      const smartTitle = await useCase.execute({
        // UI/history intentionally retain the original transcript. The helper
        // model receives a scrubbed copy so title generation cannot bypass the
        // main chat's outbound privacy boundary or persist echoed PHI as title.
        userMessage: scrubFreeText(userMessage, piiLiterals),
        assistantMessage: scrubFreeText(assistantMessage, piiLiterals),
        locale,
      })
      if (!isGenerationActive()) return

      // Auto-save assigns the session ID only after creating its document.
      await repository.updateTitle(sessionId, userId, smartTitle)
      if (!isGenerationActive()) return
      updateSession(userId, patientId || 'no-patient', fhirServerUrl || 'no-fhir-server', sessionId, { title: smartTitle })
    } catch (error) {
      console.error('[Smart Title] Failed to generate or update title:', error)
    } finally {
      const active = activeGenerationRef.current
      if (active?.sessionId === sessionId && active.revision === generationRevision) {
        activeGenerationRef.current = null
        setIsTitleGenerating(false)
      }
    }
  }, [fhirServerUrl, patientId, piiLiterals, setIsTitleGenerating, updateSession])

  useEffect(() => {
    // Only transcripts observed as new, unsaved conversations are eligible.
    // Loading a saved conversation must never rename it.
    if (!enabled || !user?.uid) {
      pendingConversationRef.current = null
      return
    }
    const userMessage = messages.find(m => m.role === 'user')
    if (!currentSessionId) {
      pendingConversationRef.current = userMessage?.id ?? null
      return
    }
    if (!userMessage || pendingConversationRef.current !== userMessage.id) return
    if (generatedSessionsRef.current.has(currentSessionId)) return
    const assistantMessage = messages.find(m => m.role === 'assistant')
    if (isStreaming || !assistantMessage?.content?.trim()) return

    generatedSessionsRef.current.add(currentSessionId)
    pendingConversationRef.current = null
    void generateSmartTitle(
      currentSessionId,
      user.uid,
      userMessage.content,
      assistantMessage.content,
      locale,
      generationGateRef.current.revision,
    )
  }, [enabled, isStreaming, generateSmartTitle, messages, currentSessionId, user?.uid, locale])

  return {
    // Expose nothing for now, this hook works automatically
  }
}
