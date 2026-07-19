/**
 * Browser-owned connection profile for an OpenAI Chat Completions compatible
 * endpoint. The logical model selected in the UI is static; `modelId` is the
 * actual upstream model name sent to the hospital/local server.
 */
export type OpenAiCompatibleTransport = 'direct' | 'mediprisma-gateway'

export interface OpenAiCompatibleConfig {
  enabled: boolean
  /** Canonical API base. Settings may accept a full `/chat/completions` URL,
   *  but the store strips that fixed suffix for SDK and Gateway routing. */
  baseUrl: string
  modelId: string
  apiKey: string | null
  /** Explicit data path. Missing legacy values always migrate to direct so a
   *  profile can never begin traversing Firebase without user consent. */
  transport?: OpenAiCompatibleTransport
  /** Upstream model's total context window. Optional only for migrating
   *  profiles saved before this setting existed. */
  contextWindowTokens?: number
}

export const DEFAULT_OPENAI_COMPATIBLE_CONTEXT_WINDOW = 15000
export const MIN_OPENAI_COMPATIBLE_CONTEXT_WINDOW = 1024
export const MAX_OPENAI_COMPATIBLE_CONTEXT_WINDOW = 2_000_000

/** Best-effort migration defaults for common local model ids. The user can
 *  always override this in Settings; unknown endpoints keep the conservative
 *  historical 15k default. */
export function suggestedOpenAiCompatibleContextWindow(modelId: string): number {
  const id = modelId.trim().toLowerCase()
  if (/nemotron-3-ultra-550b-a55b/.test(id)) return 1_000_000
  if (/qwen2[._-]?5/.test(id)) return 32768
  if (/qwen3/.test(id)) return 40960
  return DEFAULT_OPENAI_COMPATIBLE_CONTEXT_WINDOW
}

export function normalizeOpenAiCompatibleContextWindow(
  value: unknown,
  modelId = '',
): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (
    Number.isFinite(parsed) &&
    parsed >= MIN_OPENAI_COMPATIBLE_CONTEXT_WINDOW &&
    parsed <= MAX_OPENAI_COMPATIBLE_CONTEXT_WINDOW
  ) {
    return Math.round(parsed)
  }
  return suggestedOpenAiCompatibleContextWindow(modelId)
}

export const EMPTY_OPENAI_COMPATIBLE_CONFIG: Readonly<OpenAiCompatibleConfig> = {
  enabled: false,
  baseUrl: '',
  modelId: '',
  apiKey: null,
  transport: 'direct',
  contextWindowTokens: DEFAULT_OPENAI_COMPATIBLE_CONTEXT_WINDOW,
}

export function normalizeOpenAiCompatibleTransport(
  value: unknown,
): OpenAiCompatibleTransport {
  return value === 'mediprisma-gateway' ? value : 'direct'
}

export function createEmptyOpenAiCompatibleConfig(): OpenAiCompatibleConfig {
  return { ...EMPTY_OPENAI_COMPATIBLE_CONFIG }
}
