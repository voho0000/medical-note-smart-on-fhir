import type { AiModelExecution } from '@/src/core/entities/ai-model-execution.entity'

export interface MedicalChatExecutionRecord {
  version: 1
  feature: 'medical-chat'
  modelExecution?: AiModelExecution
  modelName: string
  modelId: string
  timestamp: string
  prompt: string
  inputData: unknown
  outputData: string
  hasError: boolean
  errorMessage: string | null
  status: 'completed' | 'error' | 'aborted'
}

export function medicalChatExecutionFilename(timestamp: string): string {
  const safeTimestamp = timestamp.replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
  return `mediprisma-ai-execution_${safeTimestamp}.json`
}

export function downloadMedicalChatExecution(record: MedicalChatExecutionRecord): void {
  const blob = new Blob([JSON.stringify(record, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = medicalChatExecutionFilename(record.timestamp)
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
