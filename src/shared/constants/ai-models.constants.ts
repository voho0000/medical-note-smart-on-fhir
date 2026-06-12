export type ModelProvider = "openai" | "gemini" | "claude"

export interface ModelDefinition {
  id: string
  label: string
  provider: ModelProvider
  requiresUserKey?: boolean
  disableAgentMode?: boolean // Models with known function calling issues
}

// Internal models for AI title generation (not shown to users)
export const INTERNAL_MODELS = [
  { id: "gpt-5.4-nano", label: "GPT-5.4 Nano", provider: "openai" as const },
  { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite", provider: "gemini" as const },
] as const satisfies readonly ModelDefinition[]

// User-selectable models. Per provider, the FIRST entry is the cheapest tier
// and the only one routable through the owner-funded proxy; the stronger
// three require the user's own key.
export const GPT_MODELS = [
  { id: "gpt-5.4-nano", label: "GPT-5.4 Nano", provider: "openai" },
  { id: "gpt-5.4-mini", label: "GPT-5.4 Mini", provider: "openai", requiresUserKey: true },
  { id: "gpt-5.4", label: "GPT-5.4", provider: "openai", requiresUserKey: true },
  { id: "gpt-5.5", label: "GPT-5.5", provider: "openai", requiresUserKey: true },
] as const satisfies readonly ModelDefinition[]

export const GEMINI_MODELS = [
  { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite", provider: "gemini" },
  { id: "gemini-3-flash-preview", label: "Gemini 3 Flash Preview", provider: "gemini", requiresUserKey: true },
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", provider: "gemini", requiresUserKey: true },
  { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro Preview", provider: "gemini", requiresUserKey: true },
] as const satisfies readonly ModelDefinition[]

export const CLAUDE_MODELS = [
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", provider: "claude" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", provider: "claude", requiresUserKey: true },
  { id: "claude-opus-4-8", label: "Claude Opus 4.8", provider: "claude", requiresUserKey: true },
  { id: "claude-fable-5", label: "Claude Fable 5", provider: "claude", requiresUserKey: true },
] as const satisfies readonly ModelDefinition[]

export type GptModelId = (typeof GPT_MODELS)[number]["id"]
export type GeminiModelId = (typeof GEMINI_MODELS)[number]["id"]
export type ClaudeModelId = (typeof CLAUDE_MODELS)[number]["id"]
export type ModelId = GptModelId | GeminiModelId | ClaudeModelId

export const DEFAULT_MODEL_ID: GeminiModelId = "gemini-3.1-flash-lite"

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
