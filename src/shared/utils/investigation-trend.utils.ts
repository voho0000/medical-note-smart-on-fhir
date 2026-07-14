// Medical-summary investigation trends are deliberately compact. The AI
// normally emits one serial point per arrow-separated segment; this app-side
// guard also keeps older cached summaries within the same display contract.
export const MAX_INVESTIGATION_TREND_POINTS = 3

const TREND_SEPARATOR = /\s*(?:→|⇒|->)\s*/

export function limitInvestigationTrendPoints(
  trend: string,
  maxPoints = MAX_INVESTIGATION_TREND_POINTS,
): string {
  if (maxPoints < 1) return trend
  const points = trend
    .split(TREND_SEPARATOR)
    .map((point) => point.trim())
    .filter(Boolean)

  if (points.length <= maxPoints) return trend
  return points.slice(-maxPoints).join(' → ')
}
