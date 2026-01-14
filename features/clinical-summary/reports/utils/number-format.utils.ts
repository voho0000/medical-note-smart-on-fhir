/**
 * Format a number with smart decimal precision based on its magnitude
 * - Integers: no decimals
 * - >= 100: no decimals
 * - >= 1: 1 decimal
 * - >= 0.1: 2 decimals
 * - < 0.1: 3 decimals
 */
export function formatNumberSmart(value: number): string {
  if (value === 0) return '0'
  if (value % 1 === 0) return value.toString()
  
  const absValue = Math.abs(value)
  if (absValue >= 100) return value.toFixed(0)
  if (absValue >= 1) return value.toFixed(1)
  if (absValue >= 0.1) return value.toFixed(2)
  return value.toFixed(3)
}

/**
 * Format a value (number or string) with optional unit
 */
export function formatValue(value: number | string | undefined, unit?: string): string {
  if (value === undefined || value === null) return '—'
  if (typeof value === 'string') return value
  return `${formatNumberSmart(value)}${unit ? ` ${unit}` : ''}`
}
