export type ModelProvider = "openai" | "gemini"

export interface ModelDefinition {
  id: string
  label: string
  provider: ModelProvider
  requiresUserKey?: boolean
}

// Internal models for AI title generation (not shown to users)
export const INTERNAL_MODELS = [
  { id: "gpt-5-nano", label: "GPT-5 Nano", provider: "openai" as const },
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite", provider: "gemini" as const },
] as const satisfies readonly ModelDefinition[]

// User-selectable models
export const GPT_MODELS = [
  { id: "gpt-5-mini", label: "GPT-5 Mini", provider: "openai" },
  { id: "gpt-5.1", label: "GPT-5.1", provider: "openai", requiresUserKey: true },
  { id: "gpt-5.2", label: "GPT-5.2", provider: "openai", requiresUserKey: true },
] as const satisfies readonly ModelDefinition[]

export const GEMINI_MODELS = [
  { id: "gemini-3-flash-preview", label: "Gemini 3 Flash Preview", provider: "gemini" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "gemini", requiresUserKey: true },
  { id: "gemini-3-pro-preview", label: "Gemini 3 Pro Preview", provider: "gemini", requiresUserKey: true },
] as const satisfies readonly ModelDefinition[]

export type GptModelId = (typeof GPT_MODELS)[number]["id"]
export type GeminiModelId = (typeof GEMINI_MODELS)[number]["id"]
export type ModelId = GptModelId | GeminiModelId

export const DEFAULT_MODEL_ID: GeminiModelId = "gemini-3-flash-preview"

export const GPT_MODEL_IDS = new Set<GptModelId>(GPT_MODELS.map((model) => model.id))
export const GEMINI_MODEL_IDS = new Set<GeminiModelId>(GEMINI_MODELS.map((model) => model.id))

// All models including internal ones (for validation and lookups)
export const ALL_MODELS: readonly ModelDefinition[] = [...INTERNAL_MODELS, ...GPT_MODELS, ...GEMINI_MODELS]
const ALL_MODEL_ID_LIST = ALL_MODELS.map((model) => model.id) as ModelId[]
export const ALL_MODEL_IDS = new Set<ModelId>(ALL_MODEL_ID_LIST)

export function isGptModelId(value: string): value is GptModelId {
  return GPT_MODEL_IDS.has(value as GptModelId)
}

export function isGeminiModelId(value: string): value is GeminiModelId {
  return GEMINI_MODEL_IDS.has(value as GeminiModelId)
}

export function isModelId(value: string): value is ModelId {
  return ALL_MODEL_IDS.has(value as ModelId)
}

export function getModelDefinition(modelId: string): ModelDefinition | undefined {
  return ALL_MODELS.find((model) => model.id === modelId)
}
