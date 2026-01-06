// Clinical Insights Types
import type { AiQueryResponse } from "@/src/core/entities/ai.entity"

export type QueryMetadata = AiQueryResponse['metadata']

export interface PanelStatus {
  isLoading: boolean
  error: Error | null
}

export interface ResponseEntry {
  text: string
  isEdited: boolean
  metadata: QueryMetadata | null
}

export interface InsightPanelProps {
  title: string
  subtitle?: string
  prompt: string
  onPromptChange: (value: string) => void
  onRegenerate: () => void
  onStopGeneration: () => void
  isLoading: boolean
  response: string
  error: Error | null
  canGenerate: boolean
  hasData: boolean
  onResponseChange: (value: string) => void
  isEdited: boolean
  modelMetadata: QueryMetadata | null
  fallbackModelId: string
}
