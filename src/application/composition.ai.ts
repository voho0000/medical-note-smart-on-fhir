// AI composition root. UI features call this boundary instead of depending on
// a concrete browser transport implementation.
import {
  testOpenAiCompatibleConnection as testDirectOpenAiCompatibleConnection,
  type OpenAiCompatibleConnectionResult,
} from '@/src/infrastructure/ai/openai-compatible/openai-compatible.client'
import type { OpenAiCompatibleConfig } from '@/src/shared/types/openai-compatible.types'

/** Test the configured endpoint directly from the current browser. */
export function testOpenAiCompatibleConnection(
  config: OpenAiCompatibleConfig,
): Promise<OpenAiCompatibleConnectionResult> {
  return testDirectOpenAiCompatibleConnection(config)
}
