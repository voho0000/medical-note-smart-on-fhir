// Custom Hook: Insight Generation Logic
import { useCallback, useState } from 'react'
import { useUnifiedAi } from '@/src/application/hooks/ai/use-unified-ai.hook'
import { getUserErrorMessage } from '@/src/core/errors'
import type { AiProvider } from '@/src/core/entities/ai.entity'
import type { ResponseEntry, PanelStatus } from '../types'

const SYSTEM_INSTRUCTION =
  "You are an expert clinical assistant helping healthcare professionals interpret EHR data. Use professional tone, stay factual, and note uncertainties when appropriate."

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
  const [responses, setResponses] = useState<Record<string, ResponseEntry>>({})
  const [panelStatus, setPanelStatus] = useState<Record<string, PanelStatus>>({})
  const [currentPanelId, setCurrentPanelId] = useState<string | null>(null)
  const runPanel = useCallback(
    async (panelId: string, options?: { force?: boolean }) => {
      const force = options?.force ?? false
      const panel = panels.find((item) => item.id === panelId)
      if (!panel) return
      if (!context.trim()) return

      const prompt = prompts[panelId] ?? panel.prompt
      const responseEntry = responses[panelId]
      if (!force && responseEntry?.isEdited) {
        return
      }

      const messages = [
        { role: "system" as const, content: SYSTEM_INSTRUCTION },
        {
          role: "user" as const,
          content: `${prompt}\n\n---\nPatient Clinical Context:\n${context}`,
        },
      ]

      // Set current panel ID
      setCurrentPanelId(panelId)

      // Clear response immediately for instant visual feedback
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
            // Real-time update during streaming
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
            // Final update with metadata
            const provider: AiProvider = model.startsWith('gemini') ? 'gemini' : 'openai'
            setResponses((prev) => ({
              ...prev,
              [panelId]: { 
                text: fullText, 
                isEdited: false, 
                metadata: { modelId: model, provider } 
              },
            }))
          }
        })
        
        setPanelStatus((prev) => ({
          ...prev,
          [panelId]: { isLoading: false, error: null },
        }))
      } catch (error) {
        // Use unified error handling
        const errorMessage = getUserErrorMessage(error)
        console.error(`Failed to generate insight for ${panel.title}:`, errorMessage, error)
        
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
    [context, panels, prompts, responses, model, ai],
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
