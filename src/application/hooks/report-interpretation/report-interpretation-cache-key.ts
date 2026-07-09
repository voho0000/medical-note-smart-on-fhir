import { contentSignature } from '@/src/infrastructure/cache/encrypted-session-cache'
import type { ReportInterpretationMode } from '@/src/core/entities/report-interpretation.entity'

interface BuildReportInterpretationCompositeKeyArgs {
  mode: ReportInterpretationMode
  audience: 'medical' | 'patient'
  locale: 'en' | 'zh-TW'
  preparedText: string
}

export function buildReportInterpretationCompositeKey({
  mode,
  audience,
  locale,
  preparedText,
}: BuildReportInterpretationCompositeKeyArgs): string {
  return `${mode}::${audience}::${locale}::${contentSignature(preparedText)}`
}
