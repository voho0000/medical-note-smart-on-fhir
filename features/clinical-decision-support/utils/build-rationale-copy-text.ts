/**
 * The rationale behind one decision card as plain text a physician can paste
 * into the chart, a referral, or a reimbursement appeal.
 *
 * Everything here is already on the card: the pack's semantic rule
 * (recommendation, criteria, patient data, logic, conclusion, limits), the
 * guideline references with their class, page and cited wording, and the
 * next step. Nothing is rephrased — a sentence that reaches the chart must be
 * the sentence the pack was reviewed on. The trailer names the pack version
 * so a reader can tell which rules produced the text.
 */
import type { CdssLocale, CdssRecommendation, GuidelineReference } from '../types'
import { buildPhysicianSemanticCard } from './build-physician-semantic-card'
import { dedupeFactSources } from './dedupe-fact-sources'

export interface RationaleCopyProvenance {
  packId: string
  packVersion: string
  /** YYYY-MM-DD the text was produced; today when omitted. */
  copiedOn?: string
}

function text(locale: CdssLocale, zh: string, en: string): string {
  return locale === 'en' ? en : zh
}

function referenceLine(reference: GuidelineReference, locale: CdssLocale): string {
  const parts = [
    `${reference.title} · ${reference.version}`,
    reference.recommendationId,
    reference.evidenceGrade,
    reference.printedPage
      ? text(locale, `第 ${reference.printedPage} 頁`, `p. ${reference.printedPage}`)
      : reference.page
        ? text(locale, `PDF 第 ${reference.page} 頁`, `PDF p. ${reference.page}`)
        : undefined,
    reference.locator,
  ].filter((part): part is string => Boolean(part && part.trim()))
  const cited = (reference.citedStatements ?? []).map((statement) => (
    `  「${statement.text.trim()}」（${statement.label}）`
  ))
  return [`- ${parts.join(' · ')}`, ...cited, `  ${reference.url}`].join('\n')
}

function evidenceLine(evidence: CdssRecommendation['patientEvidence'][number]): string {
  const value = evidence.value.trim()
  // The adapter prints the collection date inside most values; add it only
  // when the value carries none and a source does.
  const hasInlineDate = /\d{4}-\d{2}-\d{2}/.test(value)
  const sourceDate = hasInlineDate
    ? undefined
    : dedupeFactSources(evidence.sources ?? [])
      .map((source) => source.date)
      .filter((date): date is string => Boolean(date))
      .sort()
      .at(-1)
  return `- ${evidence.label}：${value}${sourceDate ? `（${sourceDate}）` : ''}`
}

export function buildRationaleCopyText(
  recommendation: CdssRecommendation,
  locale: CdssLocale,
  provenance?: RationaleCopyProvenance,
): string {
  const card = buildPhysicianSemanticCard(recommendation, locale)
  const moduleName = recommendation.moduleName ?? recommendation.title
  const lines: string[] = []

  lines.push(text(locale, `【判定理由】${moduleName}`, `[Decision rationale] ${moduleName}`))
  lines.push(`${text(locale, '判定', 'Assessment')}：${card.decisionQuestion}（${card.applicabilityLabel}）`)
  lines.push('')

  lines.push(text(locale, '病人資料：', 'Patient data:'))
  if (card.patientData.length === 0) lines.push(text(locale, '- （無）', '- (none)'))
  card.patientData.forEach((item) => lines.push(evidenceLine(item)))
  if (card.missingData.length > 0) {
    lines.push(text(locale, '缺少：', 'Missing:'))
    card.missingData.forEach((item) => lines.push(`- ${item}`))
  }
  lines.push('')

  lines.push(`${text(locale, '指引建議', 'Guideline recommendation')}：${card.guidelineRecommendation}`)
  if (card.eligibilityCriteria.length > 0) {
    lines.push(text(locale, '適用條件：', 'Eligibility:'))
    card.eligibilityCriteria.forEach((item) => lines.push(`- ${item}`))
  }
  if (card.decisionLogic.trim() && card.decisionLogic.trim() !== card.clinicalConclusion.trim()) {
    lines.push(`${text(locale, '判定邏輯', 'Decision logic')}：${card.decisionLogic}`)
  }
  lines.push(`${text(locale, '結論', 'Conclusion')}：${card.clinicalConclusion}`)
  lines.push('')

  if (card.nextActions.length > 0) {
    lines.push(text(locale, '下一步：', 'Next steps:'))
    card.nextActions.forEach((item) => lines.push(`- ${item}`))
    lines.push('')
  }

  if (card.guidelineRules.length > 0) {
    lines.push(text(locale, '指引依據：', 'Guideline sources:'))
    card.guidelineRules.forEach((rule) => lines.push(referenceLine(rule.reference, locale)))
    lines.push('')
  }

  if (card.limitations.length > 0) {
    lines.push(text(locale, '限制：', 'Limitations:'))
    card.limitations.forEach((item) => lines.push(`- ${item}`))
  }
  if (card.safetyBoundary && !card.limitations.includes(card.safetyBoundary)) {
    lines.push(`${text(locale, '決策邊界', 'Decision boundary')}：${card.safetyBoundary}`)
  }

  if (provenance) {
    const copiedOn = provenance.copiedOn ?? new Date().toISOString().slice(0, 10)
    lines.push('')
    lines.push(text(
      locale,
      `來源：MediPrisma 個人化照護指引 · ${provenance.packId} ${provenance.packVersion} · ${copiedOn} · 唯讀決策支援，非診斷或醫囑`,
      `Source: MediPrisma personalized care guidance · ${provenance.packId} ${provenance.packVersion} · ${copiedOn} · read-only decision support, not a diagnosis or an order`,
    ))
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
