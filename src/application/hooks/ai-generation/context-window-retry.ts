import { isProviderContextWindowExceededError } from '@/src/core/errors'
import {
  clinicalContextTokenTarget,
  fitClinicalContextTextToTokenBudget,
} from '@/src/core/utils/adaptive-clinical-context.utils'
import {
  ContextOverflowError,
  createContextOverflowIssue,
} from '@/src/shared/utils/context-budget'
import { estimateTokens } from '@/src/shared/utils/token-estimator'
import { capVghBrainContextLimit, isVghBrainModel, VGHBRAIN_CLINICAL_TOKEN_LIMIT } from '@/src/shared/utils/vghbrain-context-policy'

const PROVIDER_RETRY_TARGET_FRACTIONS = [0.7, 0.5, 0.35] as const
const TVGH_GEMMA_SAFETY_FRACTION = 0.65

export interface ContextWindowRetryRequest<TRequest, TResult> {
  clinicalContext: string
  contextLimit: number
  modelId: string
  modelName: string
  locale: string
  /** Custom document selections must survive provider/preflight recovery intact. */
  preserveClinicalContext?: boolean
  buildRequest: (clinicalContext: string) => {
    request: TRequest
    /** Complete serialized prompt text, including fixed instructions and
     * source indexes, used by the local preflight estimate. */
    requestText: string
  }
  execute: (request: TRequest) => Promise<TResult>
  /** One non-destructive recovery step to try before clinical records are
   * removed. Return true only when the next build will be smaller (for example,
   * after disabling an optional source index). It is attempted at most once. */
  recoverBeforeContextReduction?: (
    reason: 'local-preflight' | 'provider-overflow',
  ) => boolean
  onRetry?: (
    reason: 'local-preflight' | 'provider-overflow' | 'optional-overhead-removed',
    retry: number,
  ) => void
}

export interface ContextWindowRetryResult<TResult> {
  value: TResult
  clinicalContext: string
  retryCount: number
}

/** VGHBrain uses explicit 100K clinical / 150K input caps instead of a percentage.
 * Other Gemma endpoints retain their existing tokenizer headroom. */
export function providerClinicalContextSafetyFraction(modelName: string): number {
  if (isVghBrainModel(modelName)) return 1
  return /gemma/i.test(modelName)
    ? TVGH_GEMMA_SAFETY_FRACTION
    : 1
}

/** Execute one structured request with bounded context recovery. Local
 * preflight overflow and a real provider ContextWindowExceededError share the
 * same progressively smaller clinical-context targets. This keeps the retry
 * inside the original generation promise, so batch cancellation, progress,
 * and cache ownership do not briefly settle between attempts. */
export async function runWithContextWindowRetry<TRequest, TResult>(
  options: ContextWindowRetryRequest<TRequest, TResult>,
): Promise<ContextWindowRetryResult<TResult>> {
  // VGHBrain's hook already reduces whole records. Never slice the assembled
  // clinical text. Only optional source-navigation overhead can be removed.
  const isVgh = isVghBrainModel(options.modelName)
  if (isVgh || options.preserveClinicalContext) {
    for (let attempt = 0; ; attempt += 1) {
      const built = options.buildRequest(options.clinicalContext)
      const overflow = createContextOverflowIssue(built.requestText, options.modelId, {
        selectedContext: options.clinicalContext,
        selectedContextLimit: isVgh ? VGHBRAIN_CLINICAL_TOKEN_LIMIT : undefined,
        allowExactFit: isVgh,
        contextLimit: capVghBrainContextLimit(options.contextLimit, options.modelName),
      })
      if (overflow) {
        if ((!isVgh || overflow.selectedTokens! <= VGHBRAIN_CLINICAL_TOKEN_LIMIT) && attempt === 0
            && options.recoverBeforeContextReduction?.('local-preflight')) {
          options.onRetry?.('optional-overhead-removed', 0)
          continue
        }
        throw new ContextOverflowError(overflow, options.locale)
      }
      try {
        return {
          value: await options.execute(built.request),
          clinicalContext: options.clinicalContext,
          retryCount: 0,
        }
      } catch (error) {
        if (isProviderContextWindowExceededError(error) && attempt === 0
            && options.recoverBeforeContextReduction?.('provider-overflow')) {
          options.onRetry?.('optional-overhead-removed', 0)
          continue
        }
        throw error
      }
    }
  }
  const baseTarget = clinicalContextTokenTarget(options.contextLimit)
  const initialSafetyFraction = providerClinicalContextSafetyFraction(options.modelName)
  let clinicalContext = initialSafetyFraction < 1
    ? fitClinicalContextTextToTokenBudget(
        options.clinicalContext,
        Math.max(1, Math.floor(baseTarget * initialSafetyFraction)),
      )
    : options.clinicalContext
  let fallbackIndex = 0
  let retryCount = 0
  let optionalRecoveryAttempted = false

  const recoverOptionalOverhead = (
    reason: 'local-preflight' | 'provider-overflow',
  ): boolean => {
    if (optionalRecoveryAttempted || !options.recoverBeforeContextReduction) return false
    optionalRecoveryAttempted = true
    if (!options.recoverBeforeContextReduction(reason)) return false
    options.onRetry?.('optional-overhead-removed', retryCount)
    return true
  }

  const reduceClinicalContext = (): boolean => {
    const currentTokens = estimateTokens(clinicalContext)
    while (fallbackIndex < PROVIDER_RETRY_TARGET_FRACTIONS.length) {
      const fraction = PROVIDER_RETRY_TARGET_FRACTIONS[fallbackIndex]
      fallbackIndex += 1
      const targetTokens = Math.max(1, Math.floor(baseTarget * fraction))
      if (targetTokens >= currentTokens) continue
      const reduced = fitClinicalContextTextToTokenBudget(clinicalContext, targetTokens)
      if (estimateTokens(reduced) >= currentTokens) continue
      clinicalContext = reduced
      retryCount += 1
      return true
    }
    return false
  }

  while (true) {
    const built = options.buildRequest(clinicalContext)
    const localOverflow = createContextOverflowIssue(
      built.requestText,
      options.modelId,
      {
        selectedContext: clinicalContext,
        contextLimit: options.contextLimit,
      },
    )
    if (localOverflow) {
      if (recoverOptionalOverhead('local-preflight')) continue
      if (reduceClinicalContext()) {
        options.onRetry?.('local-preflight', retryCount)
        continue
      }
      throw new ContextOverflowError(localOverflow, options.locale)
    }

    try {
      return {
        value: await options.execute(built.request),
        clinicalContext,
        retryCount,
      }
    } catch (error) {
      if (!isProviderContextWindowExceededError(error)) throw error
      if (recoverOptionalOverhead('provider-overflow')) continue
      if (reduceClinicalContext()) {
        options.onRetry?.('provider-overflow', retryCount)
        continue
      }
      throw error
    }
  }
}
