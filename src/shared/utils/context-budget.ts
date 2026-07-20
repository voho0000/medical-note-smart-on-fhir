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

/** Stable, machine-readable details for a request that cannot fit the model. */
export interface ContextOverflowIssue {
  kind: 'context-overflow'
  /** Estimated tokens in the complete outbound request. */
  requestTokens: number
  /** Estimated tokens from Data Selection, when the caller supplied them. */
  selectedTokens: number | null
  /** Maximum tokens available to the complete outbound request. */
  usable: number
  /** Model's total context window. */
  limit: number
  /** Tokens held back for the model's response. */
  reserve: number
  /** Number of request tokens over the usable input budget. */
  overBy: number
  /** Concrete Data Selection target, after accounting for fixed prompt cost. */
  suggestedSelectedMax: number | null
}

/** Error wrapper that keeps overflow data intact for actionable UI handling. */
export class ContextOverflowError extends Error {
  readonly issue: ContextOverflowIssue

  constructor(issue: ContextOverflowIssue, locale: string) {
    super(formatContextOverflowIssue(issue, locale))
    this.name = 'ContextOverflowError'
    this.issue = issue
  }
}

export function isContextOverflowError(error: unknown): error is ContextOverflowError {
  return error instanceof ContextOverflowError
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
 * Inspect the complete outbound prompt and return structured overflow details.
 * Keeping the arithmetic here ensures the UI warning and navigation actions
 * use the same budget definition.
 */
export function createContextOverflowIssue(
  requestText: string,
  modelId: string,
  options: PreflightContextWarningOptions = {},
): ContextOverflowIssue | null {
  const budget = evaluateContextText(
    requestText,
    modelId,
    DEFAULT_RESPONSE_RESERVE,
    options.contextLimit,
  )
  if (budget.level !== 'over') return null

  const selectedTokens = options.selectedContext === undefined
    ? null
    : estimateTokens(options.selectedContext)
  const reserve = Math.max(0, budget.limit - budget.usable)
  const overBy = Math.max(0, budget.tokens - budget.usable)
  const suggestedSelectedMax = selectedTokens === null
    ? null
    // `evaluateContextBudget` treats exactly-full as over: keep the suggested
    // target at least one estimated token below that hard boundary.
    : Math.max(0, Math.min(selectedTokens, selectedTokens - overBy - 1))

  return {
    kind: 'context-overflow',
    requestTokens: budget.tokens,
    selectedTokens,
    usable: budget.usable,
    limit: budget.limit,
    reserve,
    overBy,
    suggestedSelectedMax,
  }
}

/** Format structured overflow data without losing the existing user wording. */
export function formatContextOverflowIssue(
  issue: ContextOverflowIssue,
  locale: string,
): string {
  const requestTokens = formatApproxTokenCount(issue.requestTokens)
  const usableTokens = formatApproxTokenCount(issue.usable)
  const limitTokens = formatApproxTokenCount(issue.limit)
  const reserveTokens = formatApproxTokenCount(issue.reserve)
  const selectedBreakdown = issue.selectedTokens !== null && issue.selectedTokens < issue.requestTokens
    ? locale === 'zh-TW'
      ? `（你選取的病歷約 ${formatApproxTokenCount(issue.selectedTokens)} tokens；其餘為 AI 指令、輸出格式與來源索引等必要內容）`
      : ` (about ${formatApproxTokenCount(issue.selectedTokens)} tokens are your selected records; the rest is required AI instructions, output formatting, and source indexing)`
    : ''
  const reductionTarget = issue.suggestedSelectedMax === null
    ? ''
    : locale === 'zh-TW'
      ? `（建議將選取病歷控制在約 ${formatApproxTokenCount(issue.suggestedSelectedMax)} tokens 以內）`
      : ` (aim for about ${formatApproxTokenCount(issue.suggestedSelectedMax)} tokens or fewer in selected records)`

  return locale === 'zh-TW'
    ? `準備送給模型的完整輸入約 ${requestTokens} tokens${selectedBreakdown}，超過此模型約 ${usableTokens} tokens 的可用輸入空間（總內容視窗約 ${limitTokens}，已保留 ${reserveTokens} 供模型回覆）。為避免結果被截斷，本次未送出；請在「資料選擇」縮小範圍${reductionTarget}，或改用內容視窗更大的模型。`
    : `The prepared complete model input is about ${requestTokens} tokens${selectedBreakdown}, over this model’s ${usableTokens}-token input budget (the full context window is about ${limitTokens}, with ${reserveTokens} reserved for the reply). The request was not sent to avoid a truncated result. Narrow the scope under Data Selection${reductionTarget} or switch to a larger-context model.`
}

/**
 * Pre-flight check for the background AI consumers (medical summary / safety
 * alerts). `requestText` is the COMPLETE outbound prompt, not only the selected
 * record text. Returns a localized, actionable warning when that request
 * overruns the model's usable input window. Structured pipelines block before
 * sending so a truncated clinical record cannot be mistaken for a full result.
 * Bilingual inline (these hooks don't carry the i18n t).
 */
export function preflightContextWarning(
  requestText: string,
  modelId: string,
  locale: string,
  options: PreflightContextWarningOptions = {},
): string | null {
  const issue = createContextOverflowIssue(requestText, modelId, options)
  return issue ? formatContextOverflowIssue(issue, locale) : null
}
