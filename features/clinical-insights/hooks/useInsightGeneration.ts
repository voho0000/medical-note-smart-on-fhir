// Custom Hook: Insight Generation State Management
// Business logic delegated to Use Case
import { useCallback, useState } from 'react'
import { useUnifiedAi } from '@/src/application/hooks/ai/use-unified-ai.hook'
import { getUserErrorMessage } from '@/src/core/errors'
import { useGenerateInsight } from '@/src/application/hooks/clinical-insights/use-generate-insight.hook'
import type { ResponseEntry, PanelStatus } from '../types'

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
  const generateInsight = useGenerateInsight()
  const [responses, setResponses] = useState<Record<string, ResponseEntry>>({})
  const [panelStatus, setPanelStatus] = useState<Record<string, PanelStatus>>({})
  const [currentPanelId, setCurrentPanelId] = useState<string | null>(null)
  const runPanel = useCallback(
    async (panelId: string, options?: { force?: boolean }) => {
      const force = options?.force ?? false
      const panel = panels.find((item) => item.id === panelId)
      if (!panel) return

      const prompt = prompts[panelId] ?? panel.prompt
      const responseEntry = responses[panelId]
      
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
        // Use unified AI streaming
        await ai.stream(messages, {
          modelId: model,
          onChunk: (chunk) => {
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
        setPanelStatus((prev) => ({
          ...prev,
          [panelId]: { isLoading: false, error: null },
        }))
      } catch (error) {
        const errorMessage = getUserErrorMessage(error)
        console.error(`Failed to generate insight for ${panel.title}:`, errorMessage, error)
        
        // State management: Set error state
        setPanelStatus((prev) => ({
          ...prev,
          [panelId]: {
            isLoading: false,
            error: new Error(errorMessage),
          },
        }))
      } finally {
        setCurrentPanelId(null)
      }
    },
    [context, panels, prompts, responses, model, ai, generateInsight],
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
    [ai]
  )

  return { runPanel, stopPanel, responses, panelStatus, setResponses }
}
