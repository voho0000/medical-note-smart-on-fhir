import type { AiModelExecution } from '@/src/core/entities/ai-model-execution.entity'
import { isCustomOpenAiModelId } from '@/src/shared/constants/ai-models.constants'
import { modelDisplayLabel } from './model-access.utils'

export function createModelExecution(requestedModelId: string, routedModelId = requestedModelId, customModelId?: string): AiModelExecution {
  return {
    requestedModelId, routedModelId, actualModelId: null, actualModelIds: [],
    ...(isCustomOpenAiModelId(routedModelId) && customModelId?.trim() ? { customModelId: customModelId.trim() } : {}),
  }
}

/** Called only when a provider call finishes without reporting its identity. */
export function markModelExecutionUnreported(execution: AiModelExecution): AiModelExecution {
  return { ...execution, hasUnreportedSteps: true }
}

export function modelExecutionUncertain(execution: AiModelExecution): boolean {
  return !execution.actualModelId || execution.hasUnreportedSteps === true
}

/** Combine the provenance of content that is still present in an artifact. */
export function mergeModelExecutions(executions: AiModelExecution[], fallback: AiModelExecution): AiModelExecution {
  if (executions.length === 0) return fallback
  return {
    ...executions[executions.length - 1],
    actualModelIds: [...new Set(executions.flatMap((execution) => execution.actualModelIds))],
    ...(executions.some(modelExecutionUncertain) ? { hasUnreportedSteps: true } : {}),
  }
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
  const expected = execution.customModelId ?? execution.routedModelId
  return execution.requestedModelId !== execution.routedModelId || (
    (!isCustomOpenAiModelId(execution.routedModelId) || Boolean(execution.customModelId)) &&
    execution.actualModelIds.some((id) => !sameModelVersion(expected, id))
  )
}

export function modelExecutionLabel(execution: AiModelExecution): string {
  // This is a display fallback only; actualModelId stays null until confirmed.
  if (execution.actualModelId) return modelDisplayLabel(execution.actualModelId)
  return execution.customModelId ?? modelDisplayLabel(execution.routedModelId)
}

export function modelExecutionNotice(execution: AiModelExecution, locale: string): string | null {
  const selected = isCustomOpenAiModelId(execution.requestedModelId) && execution.customModelId
    ? execution.customModelId : modelDisplayLabel(execution.requestedModelId)
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
  const actual = execution.actualModelIds.map((id) => modelDisplayLabel(id)).join('、')
  const uncertainty = execution.hasUnreportedSteps
    ? locale === 'zh-TW'
      ? '部分步驟的 API 未回報實際模型，無法確認全程使用的模型。'
      : 'The API did not report the model for some steps, so the models used throughout cannot be confirmed.'
    : ''
  if (!modelExecutionFallback(execution)) {
    if (!uncertainty) return null
    return locale === 'zh-TW'
      ? `已確認使用 ${actual}；${uncertainty}`
      : `Confirmed models: ${actual}. ${uncertainty}`
  }
  const fallbackNotice = locale === 'zh-TW'
    ? `本次未能依選擇的 ${selected} 完成，實際使用 ${actual}。請檢查模型可用性或 API key 後重試。`
    : `This request could not complete with the selected ${selected}. Actually used: ${actual}. Check model availability or your API key before retrying.`
  return uncertainty ? `${fallbackNotice} ${uncertainty}` : fallbackNotice
}
