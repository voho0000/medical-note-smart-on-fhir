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

// Bump whenever the fixed translation contract changes. This revision starts
// feeding the model the display-formatted source and requires line-preserving
// output, so older run-on translations must not be restored from cache.
const TRANSLATION_CONTRACT_VERSION = 'structured-source-v2'

export function buildReportInterpretationCompositeKey({
  mode,
  audience,
  locale,
  preparedText,
  customPrompt = '',
}: BuildReportInterpretationCompositeKeyArgs): string {
  const contentIdentity = `${TRANSLATION_CONTRACT_VERSION}\u0000${preparedText}\u0000custom-prompt\u0000${customPrompt.trim()}`
  return `${mode}::${audience}::${locale}::${contentSignature(contentIdentity)}`
}
