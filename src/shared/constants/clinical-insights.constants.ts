export const MAX_SUMMARY_INSIGHT_MODULES = 5
export const MAX_AUTO_INSIGHT_MODULES = 2

/** Local custom-summary output guard, not the model's input context window.
 * In the 2026-09 HMC SOAP reproduction, useful completions stayed well below
 * 4,096 tokens; a looping Assessment reached it and ran for 15 minutes without
 * a cap. A `length` finish must be labeled as partial, never as a complete note. */
export const LOCAL_INSIGHT_MAX_OUTPUT_TOKENS = 4096

export const INSIGHT_OUTPUT_FORMATS = ["plain-text", "markdown", "html"] as const
export type InsightOutputFormat = (typeof INSIGHT_OUTPUT_FORMATS)[number]

export const INSIGHT_LANGUAGE_POLICIES = ["follow-template", "interface-language"] as const
export type InsightLanguagePolicy = (typeof INSIGHT_LANGUAGE_POLICIES)[number]

export function coerceInsightOutputFormat(
  value: unknown,
  fallback: InsightOutputFormat = "markdown",
): InsightOutputFormat {
  return INSIGHT_OUTPUT_FORMATS.includes(value as InsightOutputFormat)
    ? value as InsightOutputFormat
    : fallback
}

export function coerceInsightLanguagePolicy(
  value: unknown,
  fallback: InsightLanguagePolicy = "interface-language",
): InsightLanguagePolicy {
  return INSIGHT_LANGUAGE_POLICIES.includes(value as InsightLanguagePolicy)
    ? value as InsightLanguagePolicy
    : fallback
}

/** Migration rule for templates saved before placement was introduced. */
export function coerceShowInSummary(value: unknown, panelId: unknown): boolean {
  return typeof value === "boolean" ? value : panelId === "changes"
}
