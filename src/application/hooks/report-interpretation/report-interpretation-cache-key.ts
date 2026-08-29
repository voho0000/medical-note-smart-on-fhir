import { contentSignature } from '@/src/infrastructure/cache/encrypted-session-cache'
import type { ReportInterpretationMode } from '@/src/core/entities/report-interpretation.entity'

interface BuildReportInterpretationCompositeKeyArgs {
  mode: ReportInterpretationMode
  audience: 'medical' | 'patient'
  locale: 'en' | 'zh-TW'
  preparedText: string
  /** User-configured prompt preferences must own a distinct cached result. */
  customPrompt?: string
}

export function buildReportInterpretationCompositeKey({
  mode,
  audience,
  locale,
  preparedText,
  customPrompt = '',
}: BuildReportInterpretationCompositeKeyArgs): string {
  const contentIdentity = `${preparedText}\u0000custom-prompt\u0000${customPrompt.trim()}`
  return `${mode}::${audience}::${locale}::${contentSignature(contentIdentity)}`
}
