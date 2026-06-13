// Stream Orchestrator — one AI-SDK adapter for every provider (audit C6).
//
// Previously this fanned out to three hand-rolled per-provider adapters
// (OpenAI/Gemini parsed proxy SSE by hand). Now a single AiSdkStreamAdapter
// handles OpenAI/Gemini/Claude — the provider is resolved from the model id
// inside the factory + fetch interceptor, and every proxy forwards the SDK's
// native body verbatim.
import { AiSdkStreamAdapter } from "./ai-sdk-stream.adapter"
import type { StreamConfig } from "./ai-sdk-stream.adapter"

export class StreamOrchestrator {
  private adapter = new AiSdkStreamAdapter()

  async stream(config: StreamConfig): Promise<void> {
    await this.adapter.stream(config)
  }
}
