export type ModelProvider = "openai" | "gemini"

export interface ModelDefinition {
  id: string
  label: string
  description: string
  provider: ModelProvider
  requiresUserKey?: boolean
}

export const BUILT_IN_MODELS = [
  { id: "gpt-5.1", label: "GPT-5.1", description: "Default clinical summarization", provider: "openai" },
  { id: "gpt-5-mini", label: "GPT-5 Mini", description: "Cost-efficient base model", provider: "openai" },
] as const satisfies readonly ModelDefinition[]

export const PREMIUM_MODELS = [
  { id: "gpt-4o", label: "GPT-4o", description: "High quality multimodal", provider: "openai", requiresUserKey: true },
  { id: "gpt-4.1", label: "GPT-4.1", description: "Advanced reasoning", provider: "openai", requiresUserKey: true },
] as const satisfies readonly ModelDefinition[]

export const GEMINI_MODELS = [
  {
    id: "gemini-3-flash-preview",
    label: "Gemini 3 Flash Preview",
    description: "Preview Gemini 3 Flash via proxy or personal key",
    provider: "gemini",
  },
] as const satisfies readonly ModelDefinition[]

export type BuiltInModelId = (typeof BUILT_IN_MODELS)[number]["id"]
export type PremiumModelId = (typeof PREMIUM_MODELS)[number]["id"]
export type GeminiModelId = (typeof GEMINI_MODELS)[number]["id"]
export type ModelId = BuiltInModelId | PremiumModelId | GeminiModelId

export const DEFAULT_MODEL_ID: BuiltInModelId = "gpt-5-mini"

export const BUILT_IN_MODEL_IDS = new Set<BuiltInModelId>(BUILT_IN_MODELS.map((model) => model.id))
export const PREMIUM_MODEL_IDS = new Set<PremiumModelId>(PREMIUM_MODELS.map((model) => model.id))
export const GEMINI_MODEL_IDS = new Set<GeminiModelId>(GEMINI_MODELS.map((model) => model.id))

export const ALL_MODELS: readonly ModelDefinition[] = [...BUILT_IN_MODELS, ...PREMIUM_MODELS, ...GEMINI_MODELS]
const ALL_MODEL_ID_LIST = ALL_MODELS.map((model) => model.id) as ModelId[]
export const ALL_MODEL_IDS = new Set<ModelId>(ALL_MODEL_ID_LIST)

export function isBuiltInModelId(value: string): value is BuiltInModelId {
  return BUILT_IN_MODEL_IDS.has(value as BuiltInModelId)
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
