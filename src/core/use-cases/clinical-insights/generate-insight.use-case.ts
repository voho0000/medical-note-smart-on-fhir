/**
 * Use Case: Generate Clinical Insight
 * Business logic for generating AI-powered clinical insights
 * Following Clean Architecture principles
 */

import type { AiMessage, AiProvider } from '@/src/core/entities/ai.entity'

const SYSTEM_INSTRUCTION =
  "You are an expert clinical assistant helping healthcare professionals interpret EHR data. Use professional tone, stay factual, and note uncertainties when appropriate."

export interface GenerateInsightInput {
  prompt: string
  clinicalContext: string
  modelId: string
}

export interface GenerateInsightOutput {
  text: string
  metadata: {
    modelId: string
    provider: AiProvider
  }
}

export interface StreamingCallbacks {
  onChunk?: (chunk: string) => void
  onComplete?: (fullText: string, metadata: GenerateInsightOutput['metadata']) => void
  onError?: (error: Error) => void
}

/**
 * Generate Insight Use Case
 * Pure business logic without state management
 */
export class GenerateInsightUseCase {
  /**
   * Build AI messages for insight generation
   */
  buildMessages(input: GenerateInsightInput): AiMessage[] {
    return [
      { role: "system" as const, content: SYSTEM_INSTRUCTION },
      {
        role: "user" as const,
        content: `${input.prompt}\n\n---\nPatient Clinical Context:\n${input.clinicalContext}`,
      },
    ]
  }

  /**
   * Validate input before generation
   */
  validate(input: GenerateInsightInput): { valid: boolean; error?: string } {
    if (!input.prompt.trim()) {
      return { valid: false, error: 'Prompt is required' }
    }

    if (!input.clinicalContext.trim()) {
      return { valid: false, error: 'Clinical context is required' }
    }

    if (!input.modelId) {
      return { valid: false, error: 'Model ID is required' }
    }

    return { valid: true }
  }

  /**
   * Determine AI provider from model ID
   */
  getProvider(modelId: string): AiProvider {
    return modelId.startsWith('gemini') || modelId.startsWith('models/gemini')
      ? 'gemini'
      : 'openai'
  }

  /**
   * Build metadata for the generated insight
   */
  buildMetadata(modelId: string): GenerateInsightOutput['metadata'] {
    return {
      modelId,
      provider: this.getProvider(modelId),
    }
  }
}

// Export singleton instance
export const generateInsightUseCase = new GenerateInsightUseCase()
