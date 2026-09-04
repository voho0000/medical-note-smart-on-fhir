/** Separate application input caps; these are not endpoint capability claims. */
export const VGHBRAIN_CLINICAL_TOKEN_LIMIT = 100_000
export const VGHBRAIN_INPUT_TOKEN_LIMIT = 150_000
/** Full input plus the existing 4K response reserve. */
export const VGHBRAIN_CONTEXT_LIMIT = VGHBRAIN_INPUT_TOKEN_LIMIT + 4_000

/** Matches the local VGHBrain endpoints however the model name is spelled:
 * `tvghbrain3.5`, `VGHBrain-3.5`, `vgh-brain`, `vgh_brain`, `vgh brain`. The
 * separator is optional and the leading `t` (Taipei) is optional, so a renamed
 * deployment still inherits the 100K/150K input caps instead of silently
 * falling back to generic provider behaviour. */
export function isVghBrainModel(modelName: string): boolean {
  return /t?vgh[-_ ]?brain/i.test(modelName)
}

export function capVghBrainContextLimit(limit: number, modelName: string): number {
  return isVghBrainModel(modelName) ? Math.min(limit, VGHBRAIN_CONTEXT_LIMIT) : limit
}
