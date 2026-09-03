/** Per-result provenance. A selected/routed model is not proof of execution. */
export interface AiModelExecution {
  requestedModelId: string
  routedModelId: string
  actualModelId: string | null
  /** Includes every confirmed model in a multi-step response, in call order. */
  actualModelIds: string[]
  /** A completed provider call omitted its identity; later calls cannot clear it. */
  hasUnreportedSteps?: boolean
  /** Immutable custom endpoint model name captured before sending the request. */
  customModelId?: string
}
