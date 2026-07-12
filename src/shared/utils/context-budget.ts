// Context budget evaluation — shared by the 資料選擇 token meter and the
// pre-flight guard on chat / summary / safety so both grade "how full is the
// model's context window" the same way. The estimator (token-estimator) gives
// the token count; this maps it to a level + the numbers the UI shows.
import { estimateTokens } from './token-estimator'
import { getContextLimit } from './token-estimator'

/** Tokens reserved for the model's own response (mirrors context-window-manager). */
export const DEFAULT_RESPONSE_RESERVE = 4000

/** Fraction of the usable budget above which we warn (amber) before over (red). */
export const WARN_FRACTION = 0.8

export type ContextBudgetLevel = 'ok' | 'warn' | 'over'

export interface ContextBudget {
  /** Estimated tokens of the clinical context being graded. */
  tokens: number
  /** The model's full context-window limit. */
  limit: number
  /** limit − responseReserve: what the context may actually occupy. */
  usable: number
  /** tokens / usable, clamped to [0, ∞) (can exceed 1 when over budget). */
  fraction: number
  level: ContextBudgetLevel
}

export function evaluateContextBudget(
  tokens: number,
  modelId: string,
  responseReserve: number = DEFAULT_RESPONSE_RESERVE,
): ContextBudget {
  const limit = getContextLimit(modelId)
  const usable = Math.max(1, limit - responseReserve)
  const fraction = tokens / usable
  const level: ContextBudgetLevel =
    fraction >= 1 ? 'over' : fraction >= WARN_FRACTION ? 'warn' : 'ok'
  return { tokens, limit, usable, fraction, level }
}

/** Convenience: estimate a context string and grade it in one call. */
export function evaluateContextText(
  text: string,
  modelId: string,
  responseReserve: number = DEFAULT_RESPONSE_RESERVE,
): ContextBudget {
  return evaluateContextBudget(estimateTokens(text), modelId, responseReserve)
}

/**
 * Pre-flight check for the background AI consumers (medical summary / safety
 * alerts). Returns a localized, actionable warning string when the clinical
 * context alone overruns the model's usable window — else null. These
 * pipelines don't truncate, so an overflow otherwise surfaces only as a failed
 * / malformed generation. Bilingual inline (these hooks don't carry the i18n t).
 */
export function preflightContextWarning(
  clinicalContext: string,
  modelId: string,
  locale: string,
): string | null {
  const budget = evaluateContextText(clinicalContext, modelId)
  if (budget.level !== 'over') return null
  const approxK = Math.round(budget.tokens / 1000)
  const limitK = Math.round(budget.limit / 1000)
  return locale === 'zh-TW'
    ? `選取的病歷資料約 ${approxK}k tokens,超過此模型約 ${limitK}k 的內容上限,結果可能不完整。請在「資料選擇」縮小文件或檢驗範圍,或改用內容視窗更大的模型。`
    : `The selected records are ~${approxK}k tokens, over this model’s ~${limitK}k context limit; the result may be incomplete. Narrow the documents or lab scope under Data Selection, or switch to a larger-context model.`
}
