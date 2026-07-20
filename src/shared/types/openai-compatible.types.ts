/**
 * Browser-owned connection profile for an OpenAI Chat Completions compatible
 * endpoint. `modelId` is the actual upstream model name sent to the
 * hospital/local server; a profile's separate stable id owns UI selection.
 */
export type OpenAiCompatibleTransport = 'direct' | 'mediprisma-gateway'
export type OpenAiCompatibleContextWindowSource = 'suggested' | 'detected' | 'manual'

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
  /** How the editable window was last chosen. Missing configured profiles are
   *  migrated as manual so a future probe cannot overwrite a legacy value. */
  contextWindowSource?: OpenAiCompatibleContextWindowSource
}

/** A browser-owned connection that can be selected independently from other
 * OpenAI-compatible endpoints. `profileId` is a stable, non-secret identifier;
 * it must never be derived from the endpoint URL or API key. */
export interface OpenAiCompatibleProfile extends OpenAiCompatibleConfig {
  profileId: string
}

/** Keep the Settings list and every hydration/decryption pass bounded. Ten is
 * ample for normal hospital/local use while keeping the model picker usable. */
export const MAX_OPENAI_COMPATIBLE_PROFILES = 10
export const LEGACY_OPENAI_COMPATIBLE_PROFILE_ID = 'legacy'

/** Safe starting point for a newly added local/custom model. Model size alone
 * does not determine context length; endpoint metadata and explicit user input
 * still take precedence over this fallback. */
export const DEFAULT_OPENAI_COMPATIBLE_CONTEXT_WINDOW = 32768
export const MIN_OPENAI_COMPATIBLE_CONTEXT_WINDOW = 1024
export const MAX_OPENAI_COMPATIBLE_CONTEXT_WINDOW = 2_000_000

/** Conservative migration fallbacks used only when runtime metadata is not
 *  available. The user can always override them in Settings. */
export function suggestedOpenAiCompatibleContextWindow(modelId: string): number {
  const id = modelId.trim().toLowerCase()
  // Nemotron Ultra can be configured for ~1M, but NVIDIA NIM's default runtime
  // window is 262,144. Endpoint-reported max_model_len takes precedence in UI.
  if (/nemotron-3-ultra-550b-a55b/.test(id)) return 262144
  // Qwen2.5-VL ships with a 128,000-token model limit (shown as 125K by
  // Ollama). Match this before the broader Qwen2.5 family fallback.
  if (/qwen2[._-]?5[._-]?vl/.test(id)) return 128000
  if (/qwen2[._-]?5/.test(id)) return 32768
  if (/qwen3/.test(id)) return 40960
  if (/llama[._-]?3[._-]?1/.test(id)) return 131072
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

export function normalizeOpenAiCompatibleContextWindowSource(
  value: unknown,
  hasConfiguredProfile = false,
): OpenAiCompatibleContextWindowSource {
  if (value === 'suggested' || value === 'detected' || value === 'manual') return value
  return hasConfiguredProfile ? 'manual' : 'suggested'
}

export const EMPTY_OPENAI_COMPATIBLE_CONFIG: Readonly<OpenAiCompatibleConfig> = {
  enabled: false,
  baseUrl: '',
  modelId: '',
  apiKey: null,
  transport: 'direct',
  contextWindowTokens: DEFAULT_OPENAI_COMPATIBLE_CONTEXT_WINDOW,
  contextWindowSource: 'suggested',
}

export function normalizeOpenAiCompatibleTransport(
  value: unknown,
): OpenAiCompatibleTransport {
  return value === 'mediprisma-gateway' ? value : 'direct'
}

export function createEmptyOpenAiCompatibleConfig(): OpenAiCompatibleConfig {
  return { ...EMPTY_OPENAI_COMPATIBLE_CONFIG }
}
