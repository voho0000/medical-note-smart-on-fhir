/** Per-result provenance. A selected/routed model is not proof of execution. */
export interface AiModelExecution {
  requestedModelId: string
  routedModelId: string
  actualModelId: string | null
  /** Includes every confirmed model in a multi-step response, in call order. */
  actualModelIds: string[]
}
