// Custom Hook: Insight Generation Logic
import { useCallback } from 'react'
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
  responses: Record<string, ResponseEntry>
  context: string
  openAiKey: string | null
  geminiKey: string | null
  canUseProxy: boolean
  model: string
  queryAi: (messages: any[], model: string) => Promise<{ text: string; metadata: any }>
  streamAi?: (messages: any[], model: string) => Promise<string>
  stopStreaming?: () => void
  currentPanelIdRef?: React.MutableRefObject<string | null>
  setResponses: React.Dispatch<React.SetStateAction<Record<string, ResponseEntry>>>
  setPanelStatus: React.Dispatch<React.SetStateAction<Record<string, PanelStatus>>>
}

export function useInsightGeneration({
  panels,
  prompts,
  responses,
  context,
  openAiKey,
  geminiKey,
  canUseProxy,
  model,
  queryAi,
  streamAi,
  stopStreaming,
  currentPanelIdRef,
  setResponses,
  setPanelStatus,
}: UseInsightGenerationProps) {
  const runPanel = useCallback(
    async (panelId: string, { force } = { force: false }) => {
      const panel = panels.find((item) => item.id === panelId)
      if (!panel) return
      if (!context.trim() || (!openAiKey && !geminiKey && !canUseProxy)) return

      const prompt = prompts[panelId] ?? panel.prompt
      const responseEntry = responses[panelId]
      if (!force && responseEntry?.isEdited) {
        return
      }

      const baseMessages = [
        { role: "system" as const, content: SYSTEM_INSTRUCTION },
        {
          role: "user" as const,
          content: `${prompt}\n\n---\nPatient Clinical Context:\n${context}`,
        },
      ]

      // Set current panel ID for streaming callback
      if (currentPanelIdRef) {
        currentPanelIdRef.current = panelId
      }

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
        // Use streaming if available (works with both API keys and proxy)
        const useStreaming = streamAi && (openAiKey || geminiKey || canUseProxy)
        
        if (useStreaming) {
          const responseText = await streamAi(baseMessages, model)
          setResponses((prev) => ({
            ...prev,
            [panelId]: { text: responseText || "", isEdited: false, metadata: { modelId: model, provider: model.startsWith('gemini') ? 'gemini' : 'openai' } },
          }))
        } else {
          const { text: responseText, metadata } = await queryAi(baseMessages, model)
          setResponses((prev) => ({
            ...prev,
            [panelId]: { text: responseText || "", isEdited: false, metadata },
          }))
        }
        
        setPanelStatus((prev) => ({
          ...prev,
          [panelId]: { isLoading: false, error: null },
        }))
      } catch (error) {
        // Clear current panel ID
        if (currentPanelIdRef) {
          currentPanelIdRef.current = null
        }
        console.error(`Failed to generate insight for ${panel.title}`, error)
        setPanelStatus((prev) => ({
          ...prev,
          [panelId]: {
            isLoading: false,
            error: error instanceof Error ? error : new Error(String(error)),
          },
        }))
      } finally {
        // Clear current panel ID when done
        if (currentPanelIdRef) {
          currentPanelIdRef.current = null
        }
      }
    },
    [openAiKey, geminiKey, canUseProxy, context, panels, prompts, queryAi, streamAi, currentPanelIdRef, responses, model, setResponses, setPanelStatus],
  )

  const stopPanel = useCallback(
    (panelId: string) => {
      // Stop streaming if available
      stopStreaming?.()
      
      // Update panel status to not loading
      setPanelStatus((prev) => ({
        ...prev,
        [panelId]: { isLoading: false, error: null },
      }))
      
      // Clear current panel ID
      if (currentPanelIdRef) {
        currentPanelIdRef.current = null
      }
    },
    [stopStreaming, setPanelStatus, currentPanelIdRef]
  )

  return { runPanel, stopPanel }
}
