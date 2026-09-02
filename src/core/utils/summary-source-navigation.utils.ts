export type SummarySourceNavigationMode =
  | 'enabled'
  | 'disabled-user'
  | 'disabled-auto'

/**
 * Respect the user's source-navigation preference regardless of record count.
 * Automatic disabling is reserved for a real context-window overflow observed
 * while assembling or sending the request.
 */
export function resolveSummarySourceNavigationMode(
  requested: boolean,
  disabledByContextOverflow = false,
): SummarySourceNavigationMode {
  if (!requested) return 'disabled-user'
  if (disabledByContextOverflow) return 'disabled-auto'
  return 'enabled'
}

export function summarySourceNavigationEnabled(
  mode: SummarySourceNavigationMode,
): boolean {
  return mode === 'enabled'
}
