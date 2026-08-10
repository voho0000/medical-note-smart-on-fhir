export type AiExecutionStatus = 'completed' | 'error' | 'aborted'

export interface AiExecutionDiagnosticRecord {
  version: 1
  id: string
  feature: string
  operationKey: string | null
  transport: 'query' | 'stream'
  modelName: string
  modelId: string
  timestamp: string
  prompt: string
  inputData: unknown
  outputData: string
  hasError: boolean
  errorMessage: string | null
  status: AiExecutionStatus
}

export interface AiExecutionDiagnosticsExport {
  version: 1
  exportedAt: string
  feature: string
  executions: AiExecutionDiagnosticRecord[]
}

export function aiExecutionDiagnosticsFilename(timestamp: string): string {
  const safeTimestamp = timestamp.replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
  return `mediprisma-ai-diagnostics_${safeTimestamp}.json`
}

export function downloadAiExecutionDiagnostics(
  feature: string,
  records: AiExecutionDiagnosticRecord[],
): void {
  const exportedAt = new Date().toISOString()
  const payload: AiExecutionDiagnosticsExport = {
    version: 1,
    exportedAt,
    feature,
    executions: records,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = aiExecutionDiagnosticsFilename(exportedAt)
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
