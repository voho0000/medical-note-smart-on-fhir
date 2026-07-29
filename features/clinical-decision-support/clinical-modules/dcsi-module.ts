import { buildDcsiSummary } from '../risk-stratification/dcsi'
import type {
  CdssClinicalModule,
  CdssLocale,
  CdssPatientProfile,
  CdssRecommendation,
} from '../types'

function text(locale: CdssLocale, zh: string, en: string): string {
  return locale === 'en' ? en : zh
}

function buildDcsiRecommendation(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation {
  const dcsi = buildDcsiSummary(profile, locale)
  const assessed = dcsi.domains.filter((domain) => domain.state === 'assessed')
  const affected = assessed.filter((domain) => (domain.score ?? 0) > 0)
  const affectedSummary = affected.length > 0
    ? affected.map((domain) => `${domain.label} ${domain.score}`).join('、')
    : text(locale, '目前可判讀構面未計分', 'No points in currently evaluable domains')
  const unassessedCount = dcsi.totalDomainCount - dcsi.assessedDomainCount

  return {
    id: 'dcsi-complication-burden',
    kind: 'risk-stratification',
    domain: 'complication',
    priority: 'medium',
    status: 'review',
    overviewEvidenceFactKey: 'dcsi',
    title: text(locale, '併發症負荷（DCSI）', 'Complication burden (DCSI)'),
    recommendation: text(
      locale,
      `${dcsi.headline}；${affectedSummary}。`,
      `${dcsi.headline}; ${affectedSummary}.`,
    ),
    rationale: text(
      locale,
      '用併發症負荷協助安排本次照護優先順序，不單獨決定治療。',
      'Use complication burden to prioritize care during this visit, not to determine treatment by itself.',
    ),
    patientEvidence: [{
      label: text(locale, '目前負荷', 'Current burden'),
      value: dcsi.isComplete
        ? dcsi.headline
        : text(
            locale,
            `${dcsi.headline} · ${dcsi.assessedDomainCount}/${dcsi.totalDomainCount} 類可判讀`,
            `${dcsi.headline} · ${dcsi.assessedDomainCount}/${dcsi.totalDomainCount} domains evaluable`,
          ),
      factKeys: ['dcsi'],
      sources: assessed.flatMap((domain) => (
        domain.evidence.flatMap((evidence) => evidence.sources ?? [])
      )),
    }],
    nextActions: [
      affected.length > 0
        ? text(
            locale,
            `本次優先檢視：${affected.map((domain) => domain.label).join('、')}。`,
            `Prioritize today: ${affected.map((domain) => domain.label).join(', ')}.`,
          )
        : text(
            locale,
            unassessedCount > 0 ? `其餘 ${unassessedCount} 類待病歷資料補齊。` : '依各專病模組安排追蹤。',
            unassessedCount > 0 ? `${unassessedCount} remaining domains await chart data.` : 'Follow the condition-specific modules.',
          ),
    ],
    guidelineReferences: dcsi.evidenceReferences,
    safetyBoundary: text(
      locale,
      'DCSI 是併發症負荷摘要，不是個人住院或死亡機率，也不單獨觸發用藥調整。',
      'DCSI summarizes complication burden; it is not an individual hospitalization or mortality probability and does not independently trigger medication changes.',
    ),
    dcsi,
  }
}

export const DCSI_CLINICAL_MODULE: CdssClinicalModule = {
  id: 'dcsi-complication-burden',
  enabled: true,
  build({ profile, locale }) {
    return buildDcsiRecommendation(profile, locale)
  },
}
