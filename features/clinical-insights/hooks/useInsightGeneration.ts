// Custom Hook: Insight Generation State Management
// Business logic delegated to Use Case
import { useCallback, useRef } from 'react'
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
  runPanels: (panelIds: string[], options?: { force?: boolean }) => Promise<void>
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
  // unmounting on tab switches (see useInsightResponsesStore).
  const responses = useInsightResponsesStore((s) => s.responses)
  const setResponses = useInsightResponsesStore((s) => s.setResponses)
  const panelStatus = useInsightResponsesStore((s) => s.panelStatus)
  const setPanelStatus = useInsightResponsesStore((s) => s.setPanelStatus)
  const completeBatch = useInsightResponsesStore((s) => s.completeBatch)
  // Incremented for every new batch and cancellation. A superseded request may
  // still finish at the transport layer, but it can never publish stale data.
  const runIdRef = useRef(0)

  const runPanels = useCallback(
    async (panelIds: string[], options?: { force?: boolean }) => {
      const force = options?.force ?? false
      const uniquePanelIds = [...new Set(panelIds)]
      const prepared = uniquePanelIds.flatMap((panelId) => {
        const panel = panels.find((item) => item.id === panelId)
        if (!panel) return []

        // Read through the store so this callback does not depend on every
        // completed result. Edited modules remain protected unless forced.
        const responseEntry = useInsightResponsesStore.getState().responses[panelId]
        if (!force && responseEntry?.isEdited) return []

        const input = {
          prompt: prompts[panelId] ?? panel.prompt,
          clinicalContext: context,
          modelId: model,
        }
        const validation = generateInsight.validate(input)
        if (!validation.valid) {
          console.warn(`Validation failed: ${validation.error}`)
          return []
        }
        return [{ panel, messages: generateInsight.buildMessages(input) }]
      })
      if (prepared.length === 0) return

      // The responses store + ai instance survive patient switches (module
      // store, forceMounted tab), but panel ids are stable across patients — a
      // request still running when the patient changes could write the OLD
      // patient's text into the NEW patient's panel (and it would then be
      // persisted into the new patient's cache). Remember who this run belongs
      // to and drop every write once the owner changes.
      const owner = useInsightResponsesStore.getState().ownerPatientId
      const ownerChanged = () => useInsightResponsesStore.getState().ownerPatientId !== owner
      // Custom summaries are intentionally single-batch. Starting another run
      // cancels the prior transport and invalidates every pending write.
      ai.stop()
      const runId = ++runIdRef.current
      const activePanelIds = prepared.map(({ panel }) => panel.id)

      // Keep any previous complete result in place while regenerating. For a
      // first run the cards show only a loading state. No partial response is
      // written at any point.
      setPanelStatus((prev) => ({
        ...Object.fromEntries(
          Object.entries(prev).map(([id, status]) => [
            id,
            status.isLoading ? { ...status, isLoading: false } : status,
          ]),
        ),
        ...Object.fromEntries(
          activePanelIds.map((panelId) => [panelId, { isLoading: true, error: null }]),
        ),
      }))

      const entries: Record<string, ResponseEntry> = {}
      const errors: Record<string, Error> = {}

      // Keep calls sequential to avoid a burst of simultaneous model requests,
      // but stage every completed result locally. completeBatch publishes the
      // whole set through one store update only after the final call settles.
      for (const { panel, messages } of prepared) {
        if (runIdRef.current !== runId || ownerChanged()) return
        try {
          const overflow = preflightContextWarning(
            messages.map((message) => message.content).join('\n\n'),
            model,
            locale,
          )
          if (overflow) throw new Error(overflow)
          const fullText = await ai.query(messages, { modelId: model })
          if (runIdRef.current !== runId || ownerChanged()) return
          entries[panel.id] = {
            text: fullText,
            isEdited: false,
            metadata: generateInsight.buildMetadata(model),
          }
        } catch (error) {
          if (runIdRef.current !== runId || ownerChanged()) return
          const errorMessage = getUserErrorMessage(error)
          console.error(`Failed to generate custom summary for ${panel.title}:`, errorMessage, error)
          errors[panel.id] = new Error(errorMessage)
        }
      }

      if (runIdRef.current !== runId || ownerChanged()) return
      completeBatch(activePanelIds, entries, errors)
    },
    [ai, completeBatch, context, generateInsight, locale, model, panels, prompts, setPanelStatus],
  )

  const runPanel = useCallback(
    (panelId: string, options?: { force?: boolean }) => runPanels([panelId], options),
    [runPanels],
  )

  const stopPanel = useCallback(
    (_panelId: string) => {
      // Unified AI cancellation is batch-wide; invalidate every pending write
      // and clear every loading indicator together.
      runIdRef.current += 1
      ai.stop()
      setPanelStatus((prev) => Object.fromEntries(
        Object.entries(prev).map(([id, status]) => [
          id,
          status.isLoading ? { isLoading: false, error: null } : status,
        ]),
      ))
    },
    [ai, setPanelStatus]
  )

  // Abort every in-flight request (patient switch: its output must not reach
  // the next patient's panels, and the tokens are wasted anyway).
  const stopAll = useCallback(() => {
    runIdRef.current += 1
    ai.stop()
  }, [ai])

  return { runPanel, runPanels, stopPanel, stopAll, responses, panelStatus, setResponses }
}
