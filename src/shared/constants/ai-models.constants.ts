export type ModelProvider = "openai" | "gemini" | "claude" | "custom"

export interface ModelDefinition {
  id: string
  label: string
  provider: ModelProvider
  // Conservative input-context budget (tokens) used by context-window
  // truncation (token-estimator/context-window-manager). REQUIRED so a new
  // model can never silently fall back to a tiny default — keeping this here
  // (instead of a separate CONTEXT_LIMITS table) is what prevents the two
  // lists from drifting apart.
  contextLimit: number
  requiresUserKey?: boolean
  disableAgentMode?: boolean // Models with known function calling issues
  disabled?: boolean // Temporarily not selectable (shown locked) — e.g. not yet available
}

// Internal models for AI title generation (not shown to users)
export const INTERNAL_MODELS = [
  { id: "gpt-5.4-nano", label: "GPT-5.4 Nano", provider: "openai" as const, contextLimit: 120000 },
  { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite", provider: "gemini" as const, contextLimit: 900000 },
] as const satisfies readonly ModelDefinition[]

// User-selectable models. Within each provider, an entry WITHOUT
// `requiresUserKey` is free — routable through the owner-funded proxy; entries
// flagged `requiresUserKey` need the user's own key. The first entry is always
// proxy-eligible and acts as the provider's free base (getBaseModelIdForProvider).
// Gemini intentionally exposes two free tiers (Flash-Lite + Flash Preview); the
// proxy's own allowlist (functions: ALLOWED_GEMINI_MODEL_IDS) must match.
export const GPT_MODELS = [
  { id: "gpt-5.4-nano", label: "GPT-5.4 Nano", provider: "openai", contextLimit: 120000 },
  { id: "gpt-5.4-mini", label: "GPT-5.4 Mini", provider: "openai", requiresUserKey: true, contextLimit: 120000 },
  { id: "gpt-5.4", label: "GPT-5.4", provider: "openai", requiresUserKey: true, contextLimit: 120000 },
  { id: "gpt-5.5", label: "GPT-5.5", provider: "openai", requiresUserKey: true, contextLimit: 120000 },
] as const satisfies readonly ModelDefinition[]

export const GEMINI_MODELS = [
  { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite", provider: "gemini", contextLimit: 900000 },
  { id: "gemini-3-flash-preview", label: "Gemini 3 Flash Preview", provider: "gemini", contextLimit: 900000 },
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", provider: "gemini", requiresUserKey: true, contextLimit: 900000 },
  { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro Preview", provider: "gemini", requiresUserKey: true, contextLimit: 1800000 },
] as const satisfies readonly ModelDefinition[]

export const CLAUDE_MODELS = [
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", provider: "claude", contextLimit: 180000 },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", provider: "claude", requiresUserKey: true, contextLimit: 180000 },
  { id: "claude-opus-4-8", label: "Claude Opus 4.8", provider: "claude", requiresUserKey: true, contextLimit: 180000 },
  { id: "claude-fable-5", label: "Claude Fable 5", provider: "claude", requiresUserKey: true, disabled: true, contextLimit: 180000 },
] as const satisfies readonly ModelDefinition[]

/**
 * Legacy logical id for the originally released browser-configured endpoint.
 * New profiles derive a stable id from this sentinel plus their profile id;
 * the actual upstream model name continues to live only in ai-config.store.
 */
export const CUSTOM_OPENAI_MODEL_ID = "openai-compatible-custom" as const
const CUSTOM_OPENAI_MODEL_ID_PREFIX = `${CUSTOM_OPENAI_MODEL_ID}:` as const

/**
 * Logical model id for one browser-owned OpenAI-compatible profile.
 *
 * The originally released single profile keeps the bare id so existing model
 * preferences continue to work. New profiles carry their stable, non-secret
 * profile id in the logical model id; the upstream model name remains in the
 * encrypted browser profile and is never used as preference identity.
 */
export type CustomOpenAiModelId =
  | typeof CUSTOM_OPENAI_MODEL_ID
  | `${typeof CUSTOM_OPENAI_MODEL_ID}:${string}`

export function customOpenAiModelIdForProfile(profileId: string): CustomOpenAiModelId {
  const normalizedProfileId = profileId.trim()
  if (!normalizedProfileId) throw new Error('OpenAI-compatible profile id is required')
  return normalizedProfileId === 'legacy'
    ? CUSTOM_OPENAI_MODEL_ID
    : `${CUSTOM_OPENAI_MODEL_ID_PREFIX}${normalizedProfileId}`
}

export function isCustomOpenAiModelId(value: string): value is CustomOpenAiModelId {
  return value === CUSTOM_OPENAI_MODEL_ID || (
    value.startsWith(CUSTOM_OPENAI_MODEL_ID_PREFIX) &&
    value.length > CUSTOM_OPENAI_MODEL_ID_PREFIX.length
  )
}

export function openAiCompatibleProfileIdFromModelId(modelId: string): string | null {
  if (modelId === CUSTOM_OPENAI_MODEL_ID) return 'legacy'
  if (!isCustomOpenAiModelId(modelId)) return null
  return modelId.slice(CUSTOM_OPENAI_MODEL_ID_PREFIX.length)
}

export const CUSTOM_MODELS = [
  {
    id: CUSTOM_OPENAI_MODEL_ID,
    label: "OpenAI-compatible",
    provider: "custom",
    // Conservative floor for local models whose context size is unknown.
    contextLimit: 15000,
  },
] as const satisfies readonly ModelDefinition[]

export type GptModelId = (typeof GPT_MODELS)[number]["id"]
export type GeminiModelId = (typeof GEMINI_MODELS)[number]["id"]
export type ClaudeModelId = (typeof CLAUDE_MODELS)[number]["id"]
export type CustomModelId = CustomOpenAiModelId
export type ModelId = GptModelId | GeminiModelId | ClaudeModelId | CustomModelId

export const DEFAULT_MODEL_ID: GeminiModelId = "gemini-3-flash-preview"

export const GPT_MODEL_IDS = new Set<GptModelId>(GPT_MODELS.map((model) => model.id))
export const GEMINI_MODEL_IDS = new Set<GeminiModelId>(GEMINI_MODELS.map((model) => model.id))
export const CLAUDE_MODEL_IDS = new Set<ClaudeModelId>(CLAUDE_MODELS.map((model) => model.id))

// All models including internal ones (for validation and lookups)
export const ALL_MODELS: readonly ModelDefinition[] = [
  ...INTERNAL_MODELS,
  ...GPT_MODELS,
  ...GEMINI_MODELS,
  ...CLAUDE_MODELS,
  ...CUSTOM_MODELS,
]
const ALL_MODEL_ID_LIST = ALL_MODELS.map((model) => model.id) as ModelId[]
export const ALL_MODEL_IDS = new Set<ModelId>(ALL_MODEL_ID_LIST)

export function isGptModelId(value: string): value is GptModelId {
  return GPT_MODEL_IDS.has(value as GptModelId)
}

export function isGeminiModelId(value: string): value is GeminiModelId {
  return GEMINI_MODEL_IDS.has(value as GeminiModelId)
}

export function isClaudeModelId(value: string): value is ClaudeModelId {
  return CLAUDE_MODEL_IDS.has(value as ClaudeModelId)
}

export function isModelId(value: string): value is ModelId {
  return isCustomOpenAiModelId(value) || ALL_MODEL_IDS.has(value as ModelId)
}

export function getModelDefinition(modelId: string): ModelDefinition | undefined {
  if (isCustomOpenAiModelId(modelId)) {
    return modelId === CUSTOM_OPENAI_MODEL_ID
      ? CUSTOM_MODELS[0]
      : { ...CUSTOM_MODELS[0], id: modelId }
  }
  return ALL_MODELS.find((model) => model.id === modelId)
}

// The base (proxy-eligible, no-user-key) model for a provider — its first
// non-key, non-disabled entry. Used to downgrade off a premium model when its
// user key is removed, keeping the user on the same provider's free tier.
const PROVIDER_MODELS: Record<ModelProvider, readonly ModelDefinition[]> = {
  openai: GPT_MODELS,
  gemini: GEMINI_MODELS,
  claude: CLAUDE_MODELS,
  custom: CUSTOM_MODELS,
}

export function getBaseModelIdForProvider(provider: ModelProvider): string | undefined {
  return PROVIDER_MODELS[provider].find((m) => !m.requiresUserKey && !m.disabled)?.id
}

/**
 * Whether a model may AUTO-run (auto-generate summary / auto-scan safety) rather
 * than requiring an explicit 產生/掃描 press. Eligible = the free BASE of its
 * provider (the cheap default the user lands on: nano / flash-lite / haiku) OR a
 * model paid for with the user's OWN key. Free NON-base proxy models (e.g.
 * gemini-3-flash-preview) are NOT eligible, so merely browsing the model picker
 * doesn't silently spend the visitor's free daily quota (user directive
 * 2026-07-07). Falls back to false for unknown ids.
 */
export function isAutoRunEligibleModel(modelId: string): boolean {
  const def = getModelDefinition(modelId)
  if (!def) return false
  // A configured custom endpoint is the user's/institution's own resource; it
  // does not consume the owner-funded proxy quota. Runtime readiness is gated
  // separately before an auto-run can start.
  if (def.provider === 'custom') return true
  if (def.requiresUserKey) return true
  return modelId === getBaseModelIdForProvider(def.provider)
}

/**
 * Resolve the model an AI call should ACTUALLY run on. If the picked model needs
 * the user's own key (`requiresUserKey`) but no key for its provider is present,
 * downgrade to the free, proxy-eligible default model (`fallback`, defaulting to
 * DEFAULT_MODEL_ID) — so a stranded premium pick never dead-ends with "API key is
 * missing". This covers a model that USED to be free but became key-gated (a
 * lineup change), and a default the user simply has no key for. Unknown ids fall
 * back to `fallback` too. Callers that want a different landing model (e.g. a
 * background helper pinned to a cheaper tier) pass their own `fallback`.
 *
 * `hasProviderKey` is whether the user has a key for THIS model's provider.
 */
export function gateModel(
  modelId: string,
  hasProviderKey: boolean,
  fallback: string = DEFAULT_MODEL_ID,
): string {
  const def = getModelDefinition(modelId)
  if (!def) return fallback
  if (def.requiresUserKey && !hasProviderKey) {
    return fallback
  }
  return modelId
}

/**
 * Convenience wrapper over {@link gateModel} for callers that hold the user's
 * three provider keys rather than a single "has a key for this provider" bool —
 * e.g. the deep-mode agent path (useAgentChat), which runs its own streamText
 * loop and so can't lean on the ai-sdk-stream adapter's gate. Picks the key for
 * THIS model's provider, then gates. A key for a different provider never keeps a
 * stranded pick alive (an Opus pick needs a Claude key, not a Gemini one).
 */
export function gateModelForKeys(
  modelId: string,
  keys: {
    openAiKey?: string | null
    geminiKey?: string | null
    claudeKey?: string | null
    customAvailable?: boolean
  },
  fallback: string = DEFAULT_MODEL_ID,
): string {
  const provider = getModelDefinition(modelId)?.provider ?? 'openai'
  // Custom endpoints fail closed when their browser profile is unavailable.
  // Never silently turn a persisted hospital-model choice into an owner-proxy
  // request; runtime/UI readiness checks surface the missing configuration.
  if (provider === 'custom') return modelId
  const key =
    provider === 'gemini' ? keys.geminiKey :
    provider === 'claude' ? keys.claudeKey :
    keys.openAiKey
  return gateModel(modelId, !!key, fallback)
}

/**
 * Agent-only consumers must never run a model with known tool-calling issues.
 * The picker prevents new selections; this runtime gate also covers a model
 * preference persisted before the model was marked incompatible.
 */
export function gateModelForAgentSupport(
  modelId: string,
  fallback: string = DEFAULT_MODEL_ID,
): string {
  const definition = getModelDefinition(modelId)
  return !definition || definition.disableAgentMode ? fallback : modelId
}
