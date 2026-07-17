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

export interface PreflightContextWarningOptions {
  /** The clinical context selected in the Data Selection panel. The complete
   *  request may additionally contain system instructions, an output schema,
   *  source indexes, and app-derived helpers. */
  selectedContext?: string
  /** Dynamic override for a browser-configured OpenAI-compatible model. */
  contextLimit?: number
}

/** Compact, human-readable token count shared by diagnostics and tests. */
export function formatApproxTokenCount(tokens: number): string {
  if (tokens < 1000) return `${Math.max(0, Math.round(tokens))}`
  const value = tokens / 1000
  return `${value < 10 ? value.toFixed(1).replace(/\.0$/, '') : Math.round(value)}k`
}

export function evaluateContextBudget(
  tokens: number,
  modelId: string,
  responseReserve: number = DEFAULT_RESPONSE_RESERVE,
  contextLimitOverride?: number,
): ContextBudget {
  const limit = contextLimitOverride && contextLimitOverride > 0
    ? Math.round(contextLimitOverride)
    : getContextLimit(modelId)
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
  contextLimitOverride?: number,
): ContextBudget {
  return evaluateContextBudget(
    estimateTokens(text),
    modelId,
    responseReserve,
    contextLimitOverride,
  )
}

/**
 * Pre-flight check for the background AI consumers (medical summary / safety
 * alerts). `requestText` is the COMPLETE outbound prompt, not only the selected
 * record text. Returns a localized, actionable warning when that request
 * overruns the model's usable input window. These pipelines don't truncate, so
 * an overflow otherwise surfaces only as a failed / malformed generation.
 * Bilingual inline (these hooks don't carry the i18n t).
 */
export function preflightContextWarning(
  requestText: string,
  modelId: string,
  locale: string,
  options: PreflightContextWarningOptions = {},
): string | null {
  const budget = evaluateContextText(
    requestText,
    modelId,
    DEFAULT_RESPONSE_RESERVE,
    options.contextLimit,
  )
  if (budget.level !== 'over') return null

  const requestTokens = formatApproxTokenCount(budget.tokens)
  const usableTokens = formatApproxTokenCount(budget.usable)
  const limitTokens = formatApproxTokenCount(budget.limit)
  const reserveTokens = formatApproxTokenCount(budget.limit - budget.usable)
  const selectedTokens = options.selectedContext === undefined
    ? null
    : estimateTokens(options.selectedContext)
  const selectedBreakdown = selectedTokens !== null && selectedTokens < budget.tokens
    ? locale === 'zh-TW'
      ? `（你選取的病歷約 ${formatApproxTokenCount(selectedTokens)} tokens；其餘為 AI 指令、輸出格式與來源索引等必要內容）`
      : ` (about ${formatApproxTokenCount(selectedTokens)} tokens are your selected records; the rest is required AI instructions, output formatting, and source indexing)`
    : ''

  return locale === 'zh-TW'
    ? `準備送給模型的完整輸入約 ${requestTokens} tokens${selectedBreakdown}，超過此模型約 ${usableTokens} tokens 的可用輸入空間（總內容視窗約 ${limitTokens}，已保留 ${reserveTokens} 供模型回覆）。為避免結果被截斷，本次未送出；請在「資料選擇」縮小範圍，或改用內容視窗更大的模型。`
    : `The prepared complete model input is about ${requestTokens} tokens${selectedBreakdown}, over this model’s ${usableTokens}-token input budget (the full context window is about ${limitTokens}, with ${reserveTokens} reserved for the reply). The request was not sent to avoid a truncated result. Narrow the scope under Data Selection or switch to a larger-context model.`
}
