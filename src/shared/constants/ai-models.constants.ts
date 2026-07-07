export type ModelProvider = "openai" | "gemini" | "claude"

export interface ModelDefinition {
  id: string
  label: string
  provider: ModelProvider
  requiresUserKey?: boolean
  disableAgentMode?: boolean // Models with known function calling issues
  disabled?: boolean // Temporarily not selectable (shown locked) — e.g. not yet available
}

// Internal models for AI title generation (not shown to users)
export const INTERNAL_MODELS = [
  { id: "gpt-5.4-nano", label: "GPT-5.4 Nano", provider: "openai" as const },
  { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite", provider: "gemini" as const },
] as const satisfies readonly ModelDefinition[]

// User-selectable models. Within each provider, an entry WITHOUT
// `requiresUserKey` is free — routable through the owner-funded proxy; entries
// flagged `requiresUserKey` need the user's own key. The first entry is always
// proxy-eligible and acts as the provider's free base (getBaseModelIdForProvider).
// Gemini intentionally exposes two free tiers (Flash-Lite + Flash Preview); the
// proxy's own allowlist (functions: ALLOWED_GEMINI_MODEL_IDS) must match.
export const GPT_MODELS = [
  { id: "gpt-5.4-nano", label: "GPT-5.4 Nano", provider: "openai" },
  { id: "gpt-5.4-mini", label: "GPT-5.4 Mini", provider: "openai", requiresUserKey: true },
  { id: "gpt-5.4", label: "GPT-5.4", provider: "openai", requiresUserKey: true },
  { id: "gpt-5.5", label: "GPT-5.5", provider: "openai", requiresUserKey: true },
] as const satisfies readonly ModelDefinition[]

export const GEMINI_MODELS = [
  { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite", provider: "gemini" },
  { id: "gemini-3-flash-preview", label: "Gemini 3 Flash Preview", provider: "gemini" },
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", provider: "gemini", requiresUserKey: true },
  { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro Preview", provider: "gemini", requiresUserKey: true },
] as const satisfies readonly ModelDefinition[]

export const CLAUDE_MODELS = [
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", provider: "claude" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", provider: "claude", requiresUserKey: true },
  { id: "claude-opus-4-8", label: "Claude Opus 4.8", provider: "claude", requiresUserKey: true },
  { id: "claude-fable-5", label: "Claude Fable 5", provider: "claude", requiresUserKey: true, disabled: true },
] as const satisfies readonly ModelDefinition[]

export type GptModelId = (typeof GPT_MODELS)[number]["id"]
export type GeminiModelId = (typeof GEMINI_MODELS)[number]["id"]
export type ClaudeModelId = (typeof CLAUDE_MODELS)[number]["id"]
export type ModelId = GptModelId | GeminiModelId | ClaudeModelId

export const DEFAULT_MODEL_ID: GeminiModelId = "gemini-3-flash-preview"

export const GPT_MODEL_IDS = new Set<GptModelId>(GPT_MODELS.map((model) => model.id))
export const GEMINI_MODEL_IDS = new Set<GeminiModelId>(GEMINI_MODELS.map((model) => model.id))
export const CLAUDE_MODEL_IDS = new Set<ClaudeModelId>(CLAUDE_MODELS.map((model) => model.id))

// All models including internal ones (for validation and lookups)
export const ALL_MODELS: readonly ModelDefinition[] = [...INTERNAL_MODELS, ...GPT_MODELS, ...GEMINI_MODELS, ...CLAUDE_MODELS]
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
  return ALL_MODEL_IDS.has(value as ModelId)
}

export function getModelDefinition(modelId: string): ModelDefinition | undefined {
  return ALL_MODELS.find((model) => model.id === modelId)
}

// The base (proxy-eligible, no-user-key) model for a provider — its first
// non-key, non-disabled entry. Used to downgrade off a premium model when its
// user key is removed, keeping the user on the same provider's free tier.
const PROVIDER_MODELS: Record<ModelProvider, readonly ModelDefinition[]> = {
  openai: GPT_MODELS,
  gemini: GEMINI_MODELS,
  claude: CLAUDE_MODELS,
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
  keys: { openAiKey?: string | null; geminiKey?: string | null; claudeKey?: string | null },
  fallback: string = DEFAULT_MODEL_ID,
): string {
  const provider = getModelDefinition(modelId)?.provider ?? 'openai'
  const key =
    provider === 'gemini' ? keys.geminiKey :
    provider === 'claude' ? keys.claudeKey :
    keys.openAiKey
  return gateModel(modelId, !!key, fallback)
}
