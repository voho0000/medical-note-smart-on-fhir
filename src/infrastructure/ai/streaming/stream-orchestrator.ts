// Stream Orchestrator - Coordinates streaming across different providers
import { getModelDefinition } from "@/src/shared/constants/ai-models.constants"
import { OpenAiStreamAdapter } from "./openai-stream.adapter"
import { GeminiStreamAdapter } from "./gemini-stream.adapter"
import type { StreamConfig } from "./openai-stream.adapter"

export class StreamOrchestrator {
  private openAiAdapter = new OpenAiStreamAdapter()
  private geminiAdapter = new GeminiStreamAdapter()

  async stream(config: StreamConfig): Promise<void> {
    const modelDef = getModelDefinition(config.model)
    const provider = modelDef?.provider ?? "openai"

    console.log("[StreamOrchestrator] Routing stream request", {
      model: config.model,
      provider,
      hasApiKey: !!config.apiKey,
      modelDef: modelDef ? {
        id: modelDef.id,
        provider: modelDef.provider,
        requiresUserKey: modelDef.requiresUserKey,
      } : null,
    })

    switch (provider) {
      case "openai":
        await this.openAiAdapter.stream(config)
        break
      case "gemini":
        await this.geminiAdapter.stream(config)
        break
      default:
        throw new Error(`Unsupported provider: ${provider}`)
    }
  }
}
