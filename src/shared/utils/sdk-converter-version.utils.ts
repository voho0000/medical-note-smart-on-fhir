const DISTINCT_SAME_DAY_LAB_RESULTS_VERSION = [0, 1, 3] as const

export function sdkPreservesDistinctSameDayLabResults(version: string): boolean {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(version)
  if (!match) return false

  const parsed = match.slice(1, 4).map(Number)
  for (let index = 0; index < DISTINCT_SAME_DAY_LAB_RESULTS_VERSION.length; index += 1) {
    const difference = parsed[index] - DISTINCT_SAME_DAY_LAB_RESULTS_VERSION[index]
    if (difference !== 0) return difference > 0
  }
  return true
}
