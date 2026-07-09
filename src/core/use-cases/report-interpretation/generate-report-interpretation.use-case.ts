// Use Case: Translate + interpret ONE clinical report for a layperson (pure AI,
// structured output). Builds a JSON-only prompt and parses/validates the reply
// into the fixed ReportInterpretation shape. No state, no framework — unit-testable.
//
// Scope is a SINGLE report's text (an imaging / pathology / ECG narrative, or a
// discharge-summary body), NOT the whole bundle — so there is no SOURCE CATALOG
// / citation layer here (the user is reading the one report the button sits on).
import type { AiMessage } from '@/src/core/entities/ai.entity'
import {
  ReportInterpretationSchema,
  type ReportInterpretation,
  type ReportInterpretationCoverage,
  type ReportInterpretationMode,
} from '@/src/core/entities/report-interpretation.entity'

// Same fast, cheap, clean-JSON model the safety scan pinned after the head-to-
// head eval — pin it so this on-demand task doesn't ride the user's possibly-slow
// chat model (e.g. nano). Free-tier eligible so 民眾 can use it without a key.
export const REPORT_INTERPRETATION_MODEL_ID = 'gemini-3.1-flash-lite'

// Hard cap on the report text we send. A 健保存摺 discharge summary can be many
// KB; past this we send the leading portion and flag `truncated` so the card can
// tell the user the tail wasn't interpreted (better than silently dropping it —
// see [[feedback_no_masking_bridge_bugs]] spirit: never hide a limitation).
export const REPORT_INPUT_CHAR_CAP = 12000
export const LONG_DOCUMENT_INPUT_CHAR_CAP = 20000

export interface PreparedReportText {
  text: string
  truncated: boolean
  coverage: ReportInterpretationCoverage
  mode: ReportInterpretationMode
}

const LONG_DOCUMENT_OMISSION_MARKER =
  '\n\n[...中間部分因文件過長未送入 AI；以下接文件後段 excerpt...]\n\n'

const STANDARD_SCHEMA_HINT =
  '{"translation": "<faithful, COMPLETE translation of the report into the target language; markdown ok>", ' +
  '"summary": "<one or two sentences: what this exam / document is checking>", ' +
  '"findings": "<the report\'s actual findings, in plain everyday language; markdown ok>", ' +
  '"watchFor": "<optional, gentle: what is worth keeping an eye on — omit if nothing>"}'

const LONG_DOCUMENT_SCHEMA_HINT =
  '{"translation": "<key translated passages / digest from the long document, NOT a complete line-by-line translation; markdown ok>", ' +
  '"summary": "<one or two sentences: what this document is>", ' +
  '"findings": "<the clinically important points from the available document text, in plain everyday language; markdown ok>", ' +
  '"watchFor": "<optional, gentle: what is worth keeping an eye on — omit if nothing>"}'

// The single most important rule: the translation is the source of truth the
// user checks against the original, so it must be faithful — the interpretation
// is where explanation belongs. Keeping them apart is the anti-hallucination
// firewall (see report-interpretation.entity.ts).
const FAITHFUL_TRANSLATION_RULE =
  ' The "translation" field must be a FAITHFUL, COMPLETE rendering of the report: do NOT add findings, numbers, diagnoses, or reassurance that are not in the source, and do NOT drop anything. Keep the original clinical terms but add a short gloss in parentheses where a layperson would not know the word (e.g. 「肝實質回音增強 (increased liver echogenicity)」). If the report is ALREADY in the target language, lightly clean it up and expand jargon in-place, but still change no facts. All explanation, plain-language rephrasing, and context belong ONLY in "summary" / "findings" / "watchFor" — never inside "translation".'

// Safety framing, adapted from the safety-alerts standard: no diagnosis, no
// medication changes, calm and non-alarming, never turn a finding into a scare.
const SAFETY_RULE =
  ' You are NOT diagnosing and NOT giving medical advice. NEVER tell the reader to start, stop, or change any medicine or treatment — always defer to their own doctor. Do NOT state or imply a definitive diagnosis, prognosis, or that something is or is not cancer / benign / dangerous; describe what the report SAYS and note that the treating doctor interprets what it means for them. Choose wording that does NOT make the reader anxious, fearful, or panicked (用詞避免引起病患恐慌或焦慮): stay calm, matter-of-fact and reassuring; avoid frightening or worst-case phrasing. In "watchFor", frame items as things to routinely discuss at the next visit, never as warnings that harm is occurring. Do NOT fabricate — use only what the report contains; if the report is too sparse to interpret, say so plainly in "findings" rather than inventing detail.'

const NO_POSITIONAL_RULE =
  ' "summary", "findings" and "watchFor" are SEPARATE UI blocks in a fixed layout — never point from one to another with a positional reference (上述 / 下述 / 如上 / 如下 / above / below). Make each field self-contained.'

// The reader wants to UNDERSTAND the report, not be handed homework. Do NOT
// produce a list of "questions to ask your doctor" — if something is worth
// wondering about, answer it directly in "findings" / "watchFor" in plain
// language (user directive 2026-07-07: 「如果這是應該問的，應該就要你幫忙回答」).
// The doctor still owns diagnosis and decisions (SAFETY_RULE), but the
// explanation itself should be self-sufficient.
const ANSWER_DONT_ASK_RULE =
  ' Do NOT output a list of "questions to ask your doctor". The reader wants to understand the report now — so where a layperson would naturally wonder something (what a term means, whether a finding is common, what usually happens next), ANSWER it directly and plainly inside "findings" or "watchFor", rather than telling them to go ask. Still make clear that the treating doctor decides diagnosis and next steps, but do not offload the explanation onto them.'

// Healthcare-professional version: still translates, but the interpretation is a
// concise clinical read rather than lay hand-holding (a clinician may generate
// this to hand to a patient, or to skim a foreign-language report quickly).
const SYSTEM_MEDICAL =
  'You are a clinical assistant helping a healthcare professional read ONE clinical report. ' +
  'Produce a faithful translation plus a concise, professional interpretation. ' +
  'Output ONLY a JSON object matching this schema, with NO markdown fences and NO other text:\n' +
  STANDARD_SCHEMA_HINT +
  '\n\nRules: Keep "summary" to what the study/document is; put the substantive read in "findings" using clinical language; keep it tight.' +
  FAITHFUL_TRANSLATION_RULE +
  SAFETY_RULE +
  ANSWER_DONT_ASK_RULE +
  NO_POSITIONAL_RULE

// Patient version: same faithful translation, but the interpretation is
// plain-language, reassuring, and actionable — this is the primary use case.
const SYSTEM_PATIENT =
  'You are helping a patient (a layperson, NOT a clinician) understand ONE of their own clinical reports that they cannot read — it may be in English and full of medical jargon. ' +
  'Give them a faithful translation into their language AND a calm, plain-language explanation of what it means. ' +
  'Output ONLY a JSON object matching this schema, with NO markdown fences and NO other text:\n' +
  STANDARD_SCHEMA_HINT +
  '\n\nRules: Write "summary", "findings", "watchFor" and "questions" in plain, everyday language a non-medical person understands; expand or avoid jargon. ' +
  '"summary" says, in one or two friendly sentences, what this exam or document was checking and why it is usually done. ' +
  '"findings" explains what the report actually found in plain words — translate each medical term into what it means for the body, not just a dictionary gloss, and directly answer what a layperson would naturally wonder about each finding. ' +
  '"watchFor" (optional) gently notes anything routinely worth keeping an eye on; OMIT it entirely if the report is unremarkable rather than inventing a worry. ' +
  FAITHFUL_TRANSLATION_RULE +
  SAFETY_RULE +
  ANSWER_DONT_ASK_RULE +
  NO_POSITIONAL_RULE

const LONG_DOCUMENT_RULE =
  ' This is a LONG clinical document such as a discharge summary, not a short report. ' +
  'The input may contain the complete document OR selected beginning/ending excerpts separated by an omission marker. ' +
  'Do NOT pretend this is a complete line-by-line translation when an omission marker is present. ' +
  'In "translation", provide a useful KEY TRANSLATION / digest of the clinically important available content: admission/discharge diagnoses, reason for admission, hospital course, major tests/procedures, treatment, discharge plan, and medications if present. ' +
  'Skip boilerplate demographics and administrative table noise unless it changes clinical meaning. ' +
  'If a middle portion was omitted, use only the provided text and do not infer missing details.'

const SYSTEM_LONG_DOCUMENT_MEDICAL =
  'You are a clinical assistant helping a healthcare professional read ONE long clinical document. ' +
  'Produce a concise key translation/digest plus a professional interpretation. ' +
  'Output ONLY a JSON object matching this schema, with NO markdown fences and NO other text:\n' +
  LONG_DOCUMENT_SCHEMA_HINT +
  '\n\nRules: Keep "summary" to what the document is; put the substantive clinical course and takeaways in "findings"; keep it tight.' +
  LONG_DOCUMENT_RULE +
  SAFETY_RULE +
  ANSWER_DONT_ASK_RULE +
  NO_POSITIONAL_RULE

const SYSTEM_LONG_DOCUMENT_PATIENT =
  'You are helping a patient (a layperson, NOT a clinician) understand ONE long clinical document, such as a discharge summary. ' +
  'Give them a calm key translation/digest into their language AND a plain-language explanation of what the available text says. ' +
  'Output ONLY a JSON object matching this schema, with NO markdown fences and NO other text:\n' +
  LONG_DOCUMENT_SCHEMA_HINT +
  '\n\nRules: Write "summary", "findings" and "watchFor" in plain, everyday language a non-medical person understands; expand or avoid jargon. ' +
  '"summary" says what kind of document this is and what situation it describes. ' +
  '"findings" explains the important clinical story from the available text in a way a patient can understand. ' +
  '"watchFor" (optional) gently notes anything routinely worth confirming at follow-up; OMIT it if there is nothing useful to add. ' +
  LONG_DOCUMENT_RULE +
  SAFETY_RULE +
  ANSWER_DONT_ASK_RULE +
  NO_POSITIONAL_RULE

export interface GenerateReportInterpretationInput {
  /** The raw report text (imaging / pathology narrative, or document body as
   *  plain text). Already stripped of HTML by the caller. */
  reportText: string
  /** Human-readable report title, for the model's context (e.g. "Chest CT"). */
  reportTitle?: string
  /** Target language for BOTH the translation and the interpretation. */
  locale: 'en' | 'zh-TW'
  /** Tailors tone: layperson explanation vs concise clinical read. */
  audience?: 'medical' | 'patient'
  /** Long documents use digest mode instead of pretending to translate every
   *  line of a large discharge summary. Defaults to standard report mode. */
  mode?: ReportInterpretationMode
}

/** Clamp the report text to the input cap. Returned separately so the caller can
 *  record whether truncation happened (for the card's notice + the cache key). */
export function clampReportText(text: string): { text: string; truncated: boolean } {
  const prepared = prepareReportText(text, 'standard')
  return { text: prepared.text, truncated: prepared.truncated }
}

export function prepareReportText(
  text: string,
  mode: ReportInterpretationMode = 'standard',
): PreparedReportText {
  const clean = (text ?? '').trim()
  if (mode !== 'long-document') {
    if (clean.length <= REPORT_INPUT_CHAR_CAP) {
      return { text: clean, truncated: false, coverage: 'full', mode }
    }
    return {
      text: clean.slice(0, REPORT_INPUT_CHAR_CAP),
      truncated: true,
      coverage: 'partial',
      mode,
    }
  }

  if (clean.length <= LONG_DOCUMENT_INPUT_CHAR_CAP) {
    return { text: clean, truncated: false, coverage: 'full', mode }
  }

  const available = Math.max(1000, LONG_DOCUMENT_INPUT_CHAR_CAP - LONG_DOCUMENT_OMISSION_MARKER.length)
  const headLength = Math.floor(available * 0.6)
  const tailLength = available - headLength
  return {
    text: `${clean.slice(0, headLength)}${LONG_DOCUMENT_OMISSION_MARKER}${clean.slice(-tailLength)}`,
    truncated: true,
    coverage: 'long-document-digest',
    mode,
  }
}

export class GenerateReportInterpretationUseCase {
  buildMessages(input: GenerateReportInterpretationInput): AiMessage[] {
    const mode = input.mode ?? 'standard'
    const system =
      mode === 'long-document'
        ? input.audience === 'patient'
          ? SYSTEM_LONG_DOCUMENT_PATIENT
          : SYSTEM_LONG_DOCUMENT_MEDICAL
        : input.audience === 'patient'
          ? SYSTEM_PATIENT
          : SYSTEM_MEDICAL
    const lang =
      input.locale === 'zh-TW'
        ? '\n\nTarget language: write "translation" AND every interpretation field in Traditional Chinese (繁體中文).'
        : '\n\nTarget language: write "translation" AND every interpretation field in English.'
    const { text } = prepareReportText(input.reportText, mode)
    const titleLine = input.reportTitle ? `Report title: ${input.reportTitle}\n\n` : ''
    return [
      { role: 'system', content: system + lang },
      { role: 'user', content: `${titleLine}Report text:\n${text}` },
    ]
  }

  /**
   * Parse the model's reply into a validated ReportInterpretation, or null if it
   * isn't usable JSON / fails schema validation. `truncated` is supplied by the
   * caller (it knows whether it clamped the input), not the model.
   */
  parseResult(
    text: string,
    metadata: boolean | Pick<PreparedReportText, 'truncated' | 'coverage' | 'mode'>,
  ): ReportInterpretation | null {
    const json = extractJsonObject(text)
    if (!json) return null
    let raw: unknown
    try {
      raw = JSON.parse(json)
    } catch {
      return null
    }
    const parsed = ReportInterpretationSchema.safeParse(raw)
    if (!parsed.success) return null
    const meta: Pick<PreparedReportText, 'truncated' | 'coverage' | 'mode'> =
      typeof metadata === 'boolean'
        ? { truncated: metadata, coverage: metadata ? 'partial' : 'full', mode: 'standard' }
        : metadata
    return { ...parsed.data, truncated: meta.truncated, coverage: meta.coverage, mode: meta.mode }
  }
}

/** Pull the outermost {...} out of a reply that may have fences/prose around it. */
function extractJsonObject(text: string): string | null {
  if (!text) return null
  const stripped = text.replace(/```json/gi, '').replace(/```/g, '').trim()
  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  return stripped.slice(start, end + 1)
}

export const generateReportInterpretationUseCase = new GenerateReportInterpretationUseCase()
