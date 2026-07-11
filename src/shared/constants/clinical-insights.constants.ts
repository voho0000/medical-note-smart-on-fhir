export const MAX_SUMMARY_INSIGHT_MODULES = 5
export const MAX_AUTO_INSIGHT_MODULES = 2

/** Migration rule for templates saved before placement was introduced. */
export function coerceShowInSummary(value: unknown, panelId: unknown): boolean {
  return typeof value === "boolean" ? value : panelId === "changes"
}
