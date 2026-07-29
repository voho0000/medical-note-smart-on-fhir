/// <reference lib="webworker" />

declare const self: DedicatedWorkerGlobalScope

self.postMessage({ type: 'progress', phase: 'ready' })

self.onmessage = (event: MessageEvent<{ bytes: ArrayBuffer }>) => {
  void Promise.all([
    import('../services/sdk-import-converter'),
    import('@/src/application/services/local-fhir-import-enrichment.service'),
  ])
    .then(async ([{ convertLocalImportBytes }, { enrichLocalFhirImport }]) => {
      try {
        self.postMessage({ type: 'progress', phase: 'parsed' })
        const result = convertLocalImportBytes(event.data.bytes)
        self.postMessage({ type: 'progress', phase: 'converted' })
        const bundle = await enrichLocalFhirImport(result.bundle)
        self.postMessage({ type: 'progress', phase: 'enriched' })
        self.postMessage({ type: 'success', result: { ...result, bundle } })
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'Unknown conversion error'
        self.postMessage({
          type: 'failure',
          error: `不支援的資料格式；請選擇 FHIR Bundle 或健康存摺 SDK JSON。(${detail})`,
        })
      }
    })
    .catch((error) => {
      const detail = error instanceof Error ? error.message : 'Unknown conversion error'
      self.postMessage({
        type: 'unavailable',
        error: `Local conversion worker could not load: ${detail}`,
      })
    })
}

export {}
