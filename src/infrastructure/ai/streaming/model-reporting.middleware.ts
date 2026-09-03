import { wrapLanguageModel, type LanguageModelMiddleware } from 'ai'

/** The Google SDK currently drops modelVersion. Read the provider's raw
 * metadata before that loss, without buffering text or parsing model prose. */
export function withModelReporting(
  model: Parameters<typeof wrapLanguageModel>[0]['model'],
  isGemini: boolean,
  onModelReported?: (modelId: string | null) => void,
  onModelUnreported?: () => void,
) {
  const middleware: LanguageModelMiddleware = {
    specificationVersion: 'v3',
    transformParams: async ({ params, type }) => type === 'stream' && isGemini
      ? { ...params, includeRawChunks: true }
      : params,
    wrapGenerate: async ({ doGenerate }) => {
      onModelReported?.(null)
      const result = await doGenerate()
      const raw = result.response?.body as { modelVersion?: unknown } | undefined
      const id = isGemini ? raw?.modelVersion : result.response?.modelId
      if (typeof id === 'string' && id.trim()) onModelReported?.(id)
      else onModelUnreported?.()
      return result
    },
    wrapStream: async ({ doStream }) => {
      onModelReported?.(null)
      const result = await doStream()
      let lastModelId: string | undefined
      return {
        ...result,
        stream: result.stream.pipeThrough(new TransformStream({
          transform(chunk, controller) {
            let modelId: unknown
            if (chunk.type === 'response-metadata') modelId = chunk.modelId
            if (isGemini && chunk.type === 'raw') {
              const raw = chunk.rawValue as { modelVersion?: unknown } | null
              modelId = raw?.modelVersion
            }
            if (typeof modelId === 'string' && modelId.trim() && modelId !== lastModelId) {
              lastModelId = modelId
              onModelReported?.(modelId)
              if (isGemini && chunk.type === 'raw') {
                controller.enqueue({ type: 'response-metadata', modelId })
              }
            }
            // Raw content was enabled only to recover provenance. Never expose
            // or duplicate it in the application stream or diagnostics.
            if (isGemini && chunk.type === 'raw') return
            controller.enqueue(chunk)
          },
          flush() {
            if (!lastModelId) onModelUnreported?.()
          },
        })),
      }
    },
  }
  return wrapLanguageModel({ model, middleware })
}
