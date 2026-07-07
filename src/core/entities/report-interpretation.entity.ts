// Report Interpretation — the FIXED, structured shape the AI returns for the
// 民眾「翻譯＋解讀」feature so the UI renders固定卡片 instead of a free-text blob.
// A clinical report (imaging / pathology / discharge narrative) is often in
// English and full of jargon; a layperson wants (1) a FAITHFUL translation into
// their language and, SEPARATELY, (2) a plain-language interpretation.
//
// The two are kept as DISTINCT fields on purpose: the translation must not add
// or omit anything (it is the source of truth the user can check against the
// original), while the interpretation is allowed to explain. Splitting them is
// the firewall against the model "helpfully" editorialising inside a translation.
//
// Pure AI generation, but constrained to this schema; we Zod-validate the parsed
// JSON so a malformed reply is rejected, not rendered.
import { z } from 'zod'

// Size caps CLAMP (slice/truncate) instead of rejecting — a verbose model must
// not void a whole interpretation over one oversize field (same discipline as
// safety-alert.entity.ts / medical-summary.entity.ts, 2026-07).
const trimTo = (max: number) => (s: string) => (s.length > max ? s.slice(0, max) : s)

export const ReportInterpretationSchema = z.object({
  // Faithful, complete translation of the report into the target language.
  // Markdown allowed (the source often has sections / lists). When the report
  // is ALREADY in the target language, this is a lightly-cleaned restatement
  // (jargon expanded) rather than a translation — the prompt handles that case.
  translation: z.string().min(1).transform(trimTo(6000)),
  // Plain-language interpretation, broken into fixed UI blocks:
  // 這份報告在檢查什麼 — the purpose of this exam / document, in one or two sentences.
  summary: z.string().min(1).transform(trimTo(1200)),
  // 主要發現（白話）— what the report actually found, de-jargoned. May be markdown.
  findings: z.string().min(1).transform(trimTo(3000)),
  // 需要留意什麼 — gentle, non-alarming context. Optional (a normal report may
  // have nothing to flag). NEVER a diagnosis or a instruction to change meds.
  watchFor: z.string().transform(trimTo(1500)).optional(),
  // 建議向醫師詢問的問題 — concrete questions the patient can bring to their doctor.
  questions: z
    .array(z.string().transform(trimTo(300)))
    .optional()
    .default([])
    .transform((a) => a.slice(0, 8)),
})
export type ReportInterpretationInput = z.infer<typeof ReportInterpretationSchema>

/** A validated interpretation plus app-side metadata about how it was produced
 *  (so the card can show a truncation notice / the disclaimer consistently). */
export interface ReportInterpretation extends ReportInterpretationInput {
  /** True when the source report was longer than the input cap and only the
   *  leading portion was sent to the model — the card surfaces this so the user
   *  knows the tail wasn't interpreted. */
  truncated: boolean
}
