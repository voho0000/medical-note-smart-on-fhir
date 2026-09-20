import type { CdssRecommendation } from '../types'

export type CdssSectionId = 'diagnosis' | 'treatment' | 'prognosis'
export type DiagnosisMode = 'assessment' | 'follow-up' | 'reassessment'

export const CDSS_SECTIONS = [
  { id: 'diagnosis', zh: '診斷評估', en: 'Diagnosis' },
  { id: 'treatment', zh: '治療', en: 'Treatment' },
  { id: 'prognosis', zh: '預後', en: 'Prognosis' },
] as const

/** Runtime guards also support HMC overlays whose published declarations lag. */
export function diagnosisContextOf(item?: CdssRecommendation): { mode: DiagnosisMode; basis: string } | undefined {
  const context = (item as { diagnosisContext?: unknown } | undefined)?.diagnosisContext
  if (!context || typeof context !== 'object') return undefined
  const value = context as Record<string, unknown>
  if (!['assessment', 'follow-up', 'reassessment'].includes(String(value.mode)) || typeof value.basis !== 'string') return undefined
  return { mode: value.mode as DiagnosisMode, basis: value.basis }
}

/** Explicit pack metadata wins. The fallback uses declared responsibility only. */
export function sectionOf(item: CdssRecommendation): CdssSectionId {
  const section = (item as { clinicalSection?: unknown }).clinicalSection
  if (section === 'diagnosis' || section === 'treatment' || section === 'prognosis') return section
  if (item.domain === 'safety') return 'treatment'
  if (item.id === 'heart-failure-monitoring') return 'diagnosis'
  if (item.kind === 'risk-stratification' || item.id === 'dyslipidemia-monitoring-and-markers') return 'prognosis'
  if (item.domain === 'diagnosis' || item.moduleGroup === 'assessment' && item.domain !== 'target') return 'diagnosis'
  return 'treatment'
}

/** Summary modules stay accessible without counting their children's work twice. */
export function isOverviewModule(item: CdssRecommendation): boolean {
  return item.id === 'heart-failure-hfref-gdmt'
}

export function groupCdssSections(recommendations: readonly CdssRecommendation[]) {
  const unique = [...new Map(recommendations.map(item => [item.id, item])).values()]
  const priority = { high: 0, medium: 1, routine: 2 }
  return CDSS_SECTIONS.map(section => ({
    ...section,
    modules: unique.filter(item => sectionOf(item) === section.id).sort((a, b) => (
      Number(b.domain === 'safety' && b.priority === 'high') - Number(a.domain === 'safety' && a.priority === 'high')
      || priority[a.priority] - priority[b.priority]
      || (a.moduleOrder ?? 999) - (b.moduleOrder ?? 999)
    )),
  }))
}
