import type { CdssLocale, CdssPatientProfile, CdssResult } from '../types'
import { buildDiseaseBoard, type DiseaseBoardConfig } from './disease-board'

export const HYPERTENSION_PACK_ID = 'hypertension-cdss'

export const HYPERTENSION_BOARD_CONFIG: DiseaseBoardConfig = {
  packId: HYPERTENSION_PACK_ID,
  alertStatuses: ['actionable', 'review', 'needs-data'],
  headlineModuleId: 'hypertension-bp-category',
  metrics: [
    { factKey: 'bloodPressure', zh: '血壓', en: 'BP', kind: 'measure' },
    { factKey: 'potassium', zh: 'K', en: 'K', kind: 'lab' },
    { factKey: 'eGFR', zh: 'eGFR', en: 'eGFR', kind: 'lab' },
    { factKey: 'serumCreatinine', zh: 'Creatinine', en: 'Creatinine', kind: 'lab' },
    { factKey: 'sodium', zh: 'Na', en: 'Na', kind: 'lab' },
    { factKey: 'urineAlbuminRatioQuantitative', zh: 'UACR', en: 'UACR', kind: 'lab' },
  ],
  therapy: {
    moduleId: 'hypertension-treatment-strategy',
    factKeys: ['aceArbTherapy', 'ccbTherapy', 'thiazideTherapy', 'betaBlockerTherapy', 'mraTherapy'],
  },
}

export function buildHypertensionBoard(result: CdssResult, locale: CdssLocale, now = new Date(), facts?: CdssPatientProfile['facts']) {
  const base = buildDiseaseBoard(result, HYPERTENSION_BOARD_CONFIG, locale, now, facts)
  if (!base) return undefined
  const assessment = ['hypertension-bp-category', 'hypertension-control-target', 'hypertension-measurement']
    .flatMap((id) => base.byId.has(id) ? [base.byId.get(id)!] : [])
  // Every consumed recommendation has a disclosure on the board, including
  // completed checks restored from automatedChecks. No rule is dropped.
  const consumedIds = new Set([
    ...assessment.map((item) => item.id), ...base.alerts.map((item) => item.id),
    ...(base.therapyRecommendation ? [base.therapyRecommendation.id] : []),
  ])
  const firstAction = [...base.recommendations]
    .filter((item) => item.status !== 'no-action')
    .sort((a, b) => {
      const rank = (item: typeof a) => item.domain === 'safety' ? 0
        : item.status === 'actionable' ? 1 : item.status === 'needs-data' ? 2 : 3
      return rank(a) - rank(b) || (a.moduleOrder ?? 0) - (b.moduleOrder ?? 0)
    })[0]
  return { ...base, assessment, consumedIds, firstAction }
}

export type HypertensionBoardModel = NonNullable<ReturnType<typeof buildHypertensionBoard>>
