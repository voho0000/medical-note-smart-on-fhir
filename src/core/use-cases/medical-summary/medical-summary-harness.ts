// Which prompt/orchestration harness one medical-summary run uses.
//
// The decision is the model's CONTEXT WINDOW, not its provider. What the
// compact harness compensates for — a short module-scoped contract, overview
// first, a separate small fast lane — is what a model with a small window and
// a slow prefill needs, and an on-prem endpoint is not the only model in that
// class: GPT-nano (120K), Haiku (180K) and the conservative 15K fallback all
// behave the same way on a multi-year cross-hospital chart. Anything at or
// above the frontier threshold keeps the established full prompt.
import type { MedicalSummaryHarnessProfile } from './generate-medical-summary.use-case'

/** Below this window a run is treated as compact-harness. Frontier providers
 *  that carry the long prompt comfortably (Gemini/GPT/Claude long-context
 *  tiers) all declare 1M-class windows, so the boundary separates the two
 *  classes without naming a single vendor. */
export const FRONTIER_HARNESS_MIN_CONTEXT_TOKENS = 500_000

/** True when this run should use the compact, module-scoped harness. An
 *  unknown/unusable limit is treated as small: the compact contract is the
 *  safe default, and the full prompt on a small window fails outright. */
export function usesCompactSummaryHarness(contextLimit: number | undefined): boolean {
  if (typeof contextLimit !== 'number' || !Number.isFinite(contextLimit)) return true
  return contextLimit < FRONTIER_HARNESS_MIN_CONTEXT_TOKENS
}

export function medicalSummaryHarnessProfile(
  contextLimit: number | undefined,
): MedicalSummaryHarnessProfile {
  return usesCompactSummaryHarness(contextLimit) ? 'local-small' : 'frontier'
}
