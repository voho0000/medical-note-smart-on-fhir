// Custom Hook: Insight Generation State Management
// Business logic delegated to Use Case
import { useCallback, useState } from 'react'
import { useUnifiedAi } from '@/src/application/hooks/ai/use-unified-ai.hook'
import { getUserErrorMessage } from '@/src/core/errors'
import { useGenerateInsight } from '@/src/application/hooks/clinical-insights/use-generate-insight.hook'
import { useInsightResponsesStore } from './useInsightResponsesStore'
import type { ResponseEntry, PanelStatus } from '../types'
import { preflightContextWarning } from '@/src/shared/utils/context-budget'
import { useLanguage } from '@/src/application/providers/language.provider'

interface Panel {
  id: string
  title: string
  prompt: string
}

interface UseInsightGenerationProps {
  panels: Panel[]
  prompts: Record<string, string>
  context: string
  model: string
}

interface UseInsightGenerationReturn {
  runPanel: (panelId: string, options?: { force?: boolean }) => Promise<void>
  stopPanel: (panelId: string) => void
  stopAll: () => void
  responses: Record<string, ResponseEntry>
  panelStatus: Record<string, PanelStatus>
  setResponses: React.Dispatch<React.SetStateAction<Record<string, ResponseEntry>>>
}

export function useInsightGeneration({
  panels,
  prompts,
  context,
  model,
}: UseInsightGenerationProps): UseInsightGenerationReturn {
  const ai = useUnifiedAi()
  const { locale } = useLanguage()
  const generateInsight = useGenerateInsight()
  // Responses/status live in a module-level store so they survive the panel
  // unmounting on tab switches (see useInsightResponsesStore). currentPanelId is
  // only meaningful during an active stream, so it stays local.
  const responses = useInsightResponsesStore((s) => s.responses)
  const setResponses = useInsightResponsesStore((s) => s.setResponses)
  const panelStatus = useInsightResponsesStore((s) => s.panelStatus)
  const setPanelStatus = useInsightResponsesStore((s) => s.setPanelStatus)
  const [, setCurrentPanelId] = useState<string | null>(null)
  const runPanel = useCallback(
    async (panelId: string, options?: { force?: boolean }) => {
      const force = options?.force ?? false
      const panel = panels.find((item) => item.id === panelId)
      if (!panel) return

      const prompt = prompts[panelId] ?? panel.prompt
      // Read through the store, NOT the subscribed `responses` — with it in the
      // dependency array this callback (and every memo built on it) was rebuilt
      // on each streamed chunk, re-rendering all panels while one streamed.
      const responseEntry = useInsightResponsesStore.getState().responses[panelId]

      // Skip if already edited (unless forced)
      if (!force && responseEntry?.isEdited) {
        return
      }

      // Use Use Case to validate and build messages
      const input = {
        prompt,
        clinicalContext: context,
        modelId: model,
      }

      const validation = generateInsight.validate(input)
      if (!validation.valid) {
        console.warn(`Validation failed: ${validation.error}`)
        return
      }

      const messages = generateInsight.buildMessages(input)

      // The responses store + ai instance survive patient switches (module
      // store, forceMounted tab), but panel ids are stable across patients — a
      // stream still running when the patient changes would write the OLD
      // patient's text into the NEW patient's panel (and it would then be
      // persisted into the new patient's cache). Remember who this run belongs
      // to and drop every write once the owner changes.
      const owner = useInsightResponsesStore.getState().ownerPatientId
      const ownerChanged = () => useInsightResponsesStore.getState().ownerPatientId !== owner

      // State management: Set loading state
      setCurrentPanelId(panelId)
      setResponses((prev) => ({
        ...prev,
        [panelId]: { text: "", isEdited: false, metadata: prev[panelId]?.metadata },
      }))
      setPanelStatus((prev) => ({
        ...prev,
        [panelId]: { isLoading: true, error: null },
      }))

      try {
        const overflow = preflightContextWarning(
          messages.map((message) => message.content).join('\n\n'),
          model,
          locale,
        )
        if (overflow) throw new Error(overflow)
        // Use unified AI streaming
        await ai.stream(messages, {
          modelId: model,
          onChunk: (chunk) => {
            if (ownerChanged()) return
            // State management: Update response during streaming
            setResponses((prev) => ({
              ...prev,
              [panelId]: { 
                text: chunk, 
                isEdited: false, 
                metadata: prev[panelId]?.metadata 
              },
            }))
          },
          onComplete: (fullText) => {
            if (ownerChanged()) return
            // Use Use Case to build metadata
            const metadata = generateInsight.buildMetadata(model)

            // State management: Final update
            setResponses((prev) => ({
              ...prev,
              [panelId]: { 
                text: fullText, 
                isEdited: false, 
                metadata 
              },
            }))
          }
        })
        
        // State management: Clear loading state
        if (!ownerChanged()) {
          setPanelStatus((prev) => ({
            ...prev,
            [panelId]: { isLoading: false, error: null },
          }))
        }
      } catch (error) {
        const errorMessage = getUserErrorMessage(error)
        console.error(`Failed to generate insight for ${panel.title}:`, errorMessage, error)

        // State management: Set error state
        if (!ownerChanged()) {
          setPanelStatus((prev) => ({
            ...prev,
            [panelId]: {
              isLoading: false,
              error: new Error(errorMessage),
            },
          }))
        }
      } finally {
        setCurrentPanelId(null)
      }
    },
    [context, panels, prompts, model, locale, ai, generateInsight, setResponses, setPanelStatus],
  )

  const stopPanel = useCallback(
    (panelId: string) => {
      // Stop streaming using unified AI
      ai.stop()

      // Update panel status to not loading
      setPanelStatus((prev) => ({
        ...prev,
        [panelId]: { isLoading: false, error: null },
      }))

      // Clear current panel ID
      setCurrentPanelId(null)
    },
    [ai, setPanelStatus]
  )

  // Abort every in-flight stream (patient switch: their output must not reach
  // the next patient's panels, and the tokens are wasted anyway).
  const stopAll = useCallback(() => {
    ai.stop()
    setCurrentPanelId(null)
  }, [ai])

  return { runPanel, stopPanel, stopAll, responses, panelStatus, setResponses }
}
