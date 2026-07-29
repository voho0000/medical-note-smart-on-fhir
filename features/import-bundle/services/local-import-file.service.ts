import type { ClinicalSourceMetadata } from '@/src/core/entities/clinical-data.entity'

export interface PreparedLocalImport {
  bundle: Record<string, unknown>
  sourceMetadata?: ClinicalSourceMetadata
}

type WorkerSuccess = {
  ok: true
  result: PreparedLocalImport
}

type WorkerFailure = {
  ok: false
  error: string
}

export async function prepareLocalImportFile(file: File): Promise<PreparedLocalImport> {
  if (typeof Worker === 'undefined') {
    throw new Error('此瀏覽器不支援本機資料轉換 (Web Worker is unavailable)')
  }

  const bytes = await file.arrayBuffer()
  return new Promise<PreparedLocalImport>((resolve, reject) => {
    const worker = new Worker(
      new URL('../workers/sdk-import.worker.ts', import.meta.url),
      { type: 'module' },
    )
    const finish = () => worker.terminate()

    worker.onmessage = (event: MessageEvent<WorkerSuccess | WorkerFailure>) => {
      finish()
      if (event.data.ok) resolve(event.data.result)
      else reject(new Error(event.data.error))
    }
    worker.onerror = () => {
      finish()
      reject(new Error('無法完成本機資料轉換 (Local conversion failed)'))
    }
    worker.postMessage({ bytes }, [bytes])
  })
}
