// Date Filtering Utilities
// Shared utilities for time range filtering across categories
// Following DRY (Don't Repeat Yourself) principle

/**
 * Check if a date string is within the specified time range
 * @param dateString - ISO date string to check
 * @param range - Time range identifier ('1w', '1m', '3m', '6m', '1y', 'all')
 * @returns true if date is within range or range is 'all'
 */
export function isWithinTimeRange(dateString: string | undefined, range: string): boolean {
  if (!dateString || range === 'all') return true
  
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return false
  
  const now = new Date()
  const diffInMs = now.getTime() - date.getTime()
  const diffInDays = diffInMs / (1000 * 60 * 60 * 24)
  
  switch (range) {
    case '24h': return diffInDays <= 1
    case '3d': return diffInDays <= 3
    case '1w': return diffInDays <= 7
    case '1m': return diffInDays <= 30
    case '3m': return diffInDays <= 90
    case '6m': return diffInDays <= 180
    case '1y': return diffInDays <= 365
    default: return true
  }
}

/**
 * Get the most recent date from multiple possible date fields
 * @param dates - Array of possible date strings
 * @returns The most recent date string, or undefined if none exist
 */
export function getMostRecentDate(...dates: (string | undefined)[]): string | undefined {
  const validDates = dates.filter(Boolean) as string[]
  if (validDates.length === 0) return undefined
  
  return validDates.sort((a, b) => b.localeCompare(a))[0]
}
