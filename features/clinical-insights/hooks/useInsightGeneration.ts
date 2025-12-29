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

      setPanelStatus((prev) => ({
        ...prev,
        [panelId]: { isLoading: true, error: null },
      }))

      try {
        const { text: responseText, metadata } = await queryAi(baseMessages, model)
        setResponses((prev) => ({
          ...prev,
          [panelId]: { text: responseText || "", isEdited: false, metadata },
        }))
        setPanelStatus((prev) => ({
          ...prev,
          [panelId]: { isLoading: false, error: null },
        }))
      } catch (error) {
        console.error(`Failed to generate insight for ${panel.title}`, error)
        setPanelStatus((prev) => ({
          ...prev,
          [panelId]: {
            isLoading: false,
            error: error instanceof Error ? error : new Error(String(error)),
          },
        }))
      }
    },
    [openAiKey, geminiKey, canUseProxy, context, panels, prompts, queryAi, responses, model, setResponses, setPanelStatus],
  )

  return { runPanel }
}
