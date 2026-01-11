/**
 * Application Hook: Generate Insight
 * 
 * Facade hook for generating clinical insights.
 * Isolates features from core use case details.
 * 
 * Architecture: Application Layer
 * - Features should use this hook instead of directly importing use cases
 */

import { generateInsightUseCase } from '@/src/core/use-cases/clinical-insights/generate-insight.use-case'

export function useGenerateInsight() {
  return generateInsightUseCase
}
