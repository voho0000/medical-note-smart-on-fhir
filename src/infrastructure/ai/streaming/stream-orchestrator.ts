// Stream Orchestrator — one AI-SDK adapter for every provider (audit C6).
//
// Previously this fanned out to three hand-rolled per-provider adapters
// (OpenAI/Gemini parsed proxy SSE by hand). Now a single AiSdkStreamAdapter
// handles OpenAI/Gemini/Claude — the provider is resolved from the model id
// inside the factory + fetch interceptor, and every proxy forwards the SDK's
// native body verbatim.
import type { StreamConfig } from "./ai-sdk-stream.adapter"

export interface AiStreamAdapter {
  stream(config: StreamConfig): Promise<void>
}

export class StreamOrchestrator {
  constructor(private readonly adapter: AiStreamAdapter) {}

  async stream(config: StreamConfig): Promise<void> {
    await this.adapter.stream(config)
  }
}
