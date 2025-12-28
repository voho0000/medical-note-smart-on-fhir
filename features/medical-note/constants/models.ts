export const BUILT_IN_MODELS = [
  { id: "gpt-5.1", label: "GPT-5.1", description: "Default clinical summarization" },
  { id: "gpt-5-mini", label: "GPT-5 Mini", description: "Cost-efficient base model" },
] as const

export const PREMIUM_MODELS = [
  { id: "gpt-4o", label: "GPT-4o", description: "High quality multimodal" },
  { id: "gpt-4.1", label: "GPT-4.1", description: "Advanced reasoning" },
] as const

export type BuiltInModelId = (typeof BUILT_IN_MODELS)[number]["id"]
export type PremiumModelId = (typeof PREMIUM_MODELS)[number]["id"]
export type ModelId = BuiltInModelId | PremiumModelId

export const DEFAULT_MODEL_ID: BuiltInModelId = BUILT_IN_MODELS[0]?.id ?? "gpt-5.1"

export const BUILT_IN_MODEL_IDS = new Set<BuiltInModelId>(BUILT_IN_MODELS.map((model) => model.id))
export const PREMIUM_MODEL_IDS = new Set<PremiumModelId>(PREMIUM_MODELS.map((model) => model.id))

export const ALL_MODELS = [...BUILT_IN_MODELS, ...PREMIUM_MODELS]
export const ALL_MODEL_IDS = new Set<ModelId>(ALL_MODELS.map((model) => model.id))

export function isBuiltInModelId(value: string): value is BuiltInModelId {
  return BUILT_IN_MODEL_IDS.has(value as BuiltInModelId)
}

export function isModelId(value: string): value is ModelId {
  return ALL_MODEL_IDS.has(value as ModelId)
}
