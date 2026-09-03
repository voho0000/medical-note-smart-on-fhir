import type { AiModelExecution } from '@/src/core/entities/ai-model-execution.entity'
import { isCustomOpenAiModelId } from '@/src/shared/constants/ai-models.constants'
import { modelDisplayLabel } from './model-access.utils'

export function createModelExecution(requestedModelId: string, routedModelId = requestedModelId): AiModelExecution {
  return { requestedModelId, routedModelId, actualModelId: null, actualModelIds: [] }
}

export function reportModelExecution(execution: AiModelExecution, actualModelId: string | null): AiModelExecution {
  if (actualModelId === null) return { ...execution, actualModelId: null }
  const id = actualModelId.trim().replace(/^models\//, '')
  if (!id) return execution
  return {
    ...execution,
    actualModelId: id,
    actualModelIds: execution.actualModelIds.includes(id)
      ? execution.actualModelIds
      : [...execution.actualModelIds, id],
  }
}

// Provider-pinned revisions of the selected model are not fallback models.
// Do not use prefix matching: Flash-Lite must never match Flash.
export function sameModelVersion(selected: string, actual: string): boolean {
  const normalize = (id: string) => id.replace(/^models\//, '').replace(/-(?:\d{4}-\d{2}-\d{2}|\d{8}|\d{3})$/, '')
  return normalize(selected) === normalize(actual)
}

export function modelExecutionFallback(execution: AiModelExecution): boolean {
  return execution.requestedModelId !== execution.routedModelId || (
    !isCustomOpenAiModelId(execution.routedModelId) &&
    execution.actualModelIds.some((id) => !sameModelVersion(execution.routedModelId, id))
  )
}

export function modelExecutionLabel(execution: AiModelExecution, locale = 'en'): string {
  return execution.actualModelId
    ? modelDisplayLabel(execution.actualModelId)
    : locale === 'zh-TW' ? '實際模型未回報' : 'Actual model not reported'
}

export function modelExecutionNotice(execution: AiModelExecution, locale: string): string | null {
  const selected = modelDisplayLabel(execution.requestedModelId)
  if (!execution.actualModelId) {
    return locale === 'zh-TW'
      ? `原先選擇 ${selected}；服務未回報實際模型，無法確認本次使用的模型。`
      : `Selected ${selected}; the service did not report which model actually ran.`
  }
  if (!modelExecutionFallback(execution)) return null
  const actual = execution.actualModelIds.map((id) => modelDisplayLabel(id)).join('、')
  return locale === 'zh-TW'
    ? `本次未能依選擇的 ${selected} 完成，實際使用 ${actual}。請檢查模型可用性或 API key 後重試。`
    : `This request could not complete with the selected ${selected}. Actually used: ${actual}. Check model availability or your API key before retrying.`
}
