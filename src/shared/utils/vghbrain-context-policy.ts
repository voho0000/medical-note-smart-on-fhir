/** Separate application input caps; these are not endpoint capability claims. */
export const VGHBRAIN_CLINICAL_TOKEN_LIMIT = 100_000
export const VGHBRAIN_INPUT_TOKEN_LIMIT = 150_000
/** Full input plus the existing 4K response reserve. */
export const VGHBRAIN_CONTEXT_LIMIT = VGHBRAIN_INPUT_TOKEN_LIMIT + 4_000

export function isVghBrainModel(modelName: string): boolean {
  return /tvghbrain/i.test(modelName)
}

export function capVghBrainContextLimit(limit: number, modelName: string): number {
  return isVghBrainModel(modelName) ? Math.min(limit, VGHBRAIN_CONTEXT_LIMIT) : limit
}
