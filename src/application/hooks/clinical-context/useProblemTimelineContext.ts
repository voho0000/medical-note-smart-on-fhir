// Problem Timeline Context Hook — the claims-derived longitudinal view that
// sits directly under the Problem List. See problem-timeline.utils.ts for the
// grouping/citation contract; this hook only supplies scope and locale.
import { useMemo } from 'react'
import type { ClinicalContextSection } from '@/src/core/entities/clinical-context.entity'
import type { ClinicalData } from './types'
import { useLanguage } from '@/src/application/providers/language.provider'
import { buildProblemTimelineSection } from '@/src/core/utils/problem-timeline.utils'

export function useProblemTimelineContext(
  includeProblemList: boolean,
  clinicalData: ClinicalData | null,
): ClinicalContextSection | null {
  const { locale } = useLanguage()
  return useMemo(() => {
    if (!includeProblemList || !clinicalData) return null
    return buildProblemTimelineSection(
      {
        conditions: (clinicalData.conditions as any[]) ?? [],
        encounters: (clinicalData as any).encounters ?? [],
      },
      { locale },
    )
  }, [includeProblemList, clinicalData, locale])
}
