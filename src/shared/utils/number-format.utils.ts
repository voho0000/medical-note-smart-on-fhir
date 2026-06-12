/**
 * Format a number preserving the source's decimal precision,
 * with a magnitude-based minimum floor (only pads up, never truncates).
 *
 * Minimum decimals by magnitude:
 *   >= 100 → 0  |  >= 1 → 1  |  >= 0.1 → 2  |  < 0.1 → 3
 *
 * Examples:
 *   1.490  → stored as 1.49 by JSON → "1.49"  (not "1.5")
 *   1.5    → "1.5"
 *   23     → "23"
 *   0.05   → "0.05"
 *   0.0012 → "0.0012"
 */
export function formatNumberSmart(value: number): string {
  if (value === 0) return '0'
  if (value % 1 === 0) return value.toString()

  const str = value.toString()
  const srcDecimals = str.includes('.') ? str.split('.')[1].length : 0

  const absValue = Math.abs(value)
  const minDecimals = absValue >= 100 ? 0 : absValue >= 1 ? 1 : absValue >= 0.1 ? 2 : 3

  // Source has equal or more precision than our floor → use it as-is (no rounding)
  if (srcDecimals >= minDecimals) return str
  // Source has fewer decimals than floor → pad up to minimum
  return value.toFixed(minDecimals)
}

/**
 * Format a value (number or string) with optional unit
 */
export function formatValue(value: number | string | undefined, unit?: string): string {
  if (value === undefined || value === null) return '—'
  if (typeof value === 'string') return value
  return `${formatNumberSmart(value)}${unit ? ` ${unit}` : ''}`
}
