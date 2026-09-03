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

export function modelExecutionLabel(execution: AiModelExecution): string {
  // This is a display fallback only; actualModelId stays null until confirmed.
  return modelDisplayLabel(execution.actualModelId ?? execution.routedModelId)
}

export function modelExecutionNotice(execution: AiModelExecution, locale: string): string | null {
  const selected = modelDisplayLabel(execution.requestedModelId)
  if (!execution.actualModelId) {
    if (modelExecutionFallback(execution)) {
      const routed = modelDisplayLabel(execution.routedModelId)
      const reported = execution.actualModelIds.map((id) => modelDisplayLabel(id)).join('、')
      return locale === 'zh-TW'
        ? `本次未能全程依選擇的 ${selected} 完成；已請求 ${routed}${reported ? `，先前步驟實際使用 ${reported}` : ''}。API 未回報最後步驟的實際模型，無法確認。`
        : `This request did not use the selected ${selected} throughout; requested ${routed}${reported ? `, earlier steps used ${reported}` : ''}. The API did not report the final step's actual model.`
    }
    return locale === 'zh-TW'
      ? `目前顯示所選模型 ${selected}。API 未回報實際模型，無法確認本次使用的模型。`
      : `Showing the selected model, ${selected}. The API did not report which model actually ran, so it cannot be confirmed.`
  }
  if (!modelExecutionFallback(execution)) return null
  const actual = execution.actualModelIds.map((id) => modelDisplayLabel(id)).join('、')
  return locale === 'zh-TW'
    ? `本次未能依選擇的 ${selected} 完成，實際使用 ${actual}。請檢查模型可用性或 API key 後重試。`
    : `This request could not complete with the selected ${selected}. Actually used: ${actual}. Check model availability or your API key before retrying.`
}
