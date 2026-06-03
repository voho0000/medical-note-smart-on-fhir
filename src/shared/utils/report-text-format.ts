// Pure parser that turns a free-text hospital report (endoscopy, imaging, ECG,
// pathology) into a lightly-structured list of lines for indented rendering.
//
// Why this exists: the NHI-FHIR bridge delivers these reports as one long
// `DiagnosticReport.conclusion` / `Observation.valueString` blob — section
// headings, numbered findings and recommendations are all run together, often
// with NO separator between a heading and its neighbour (e.g.
// "...descending colon.Impression:"). Rendering that blob verbatim is hard to
// read. This parser re-flows it into headings + indented items so the history
// detail view (and the inline card expansion) can lay it out hierarchically.
//
// IMPORTANT: this is a *display* transform only. It never edits clinical values
// — measurements like "0.5 cm" / "5%-25%" must survive untouched (the numbered-
// item detector has an explicit decimal guard so "0.5" is not mistaken for an
// item marker "0.").

export interface ReportLine {
  /** Text content of the line (any leading marker stripped). */
  text: string
  /** Indentation level: 0 = section heading / flush body, 1 = item, 2 = sub-item. */
  level: 0 | 1 | 2
  /** Leading list marker, if any (e.g. "1.", "2)", "a)", "•"). Rendered separately. */
  marker?: string
  /** True when the line is a section heading (e.g. "Impression:"). */
  heading?: boolean
}

// Section headings commonly seen in TW hospital endoscopy / imaging / ECG /
// pathology reports. Capitalised on purpose — the split + heading detection is
// case-sensitive so an ordinary lowercase word that merely contains one of
// these substrings is not mistaken for a heading.
// NOTE: keep multi-word / longer variants *before* their shorter prefixes so the
// alternation prefers the longest match (e.g. "Other Interpretations" before
// "Interpretations", "Impressions" before "Impression").
const SECTION_KEYWORDS = [
  'Endoscopy',
  'Esophagoscopy',
  'Gastroscopy',
  'Colonoscopy',
  'Sigmoidoscopy',
  'Bronchoscopy',
  'Indications',
  'Indication',
  'Premedication',
  'Instruments',
  'Instrument',
  'Findings',
  'Finding',
  'Impressions',
  'Impression',
  'Diagnosis',
  'Conclusions',
  'Conclusion',
  'Recommendations',
  'Recommendation',
  'Procedures',
  'Procedure',
  'Complications',
  'Complication',
  'Comments',
  'Comment',
  'Methods',
  'Method',
  'Other Interpretations',
  'Interpretations',
  'Interpretation',
  'Technique',
  'Comparison',
  'History',
]

const KEYWORD_SOURCE = SECTION_KEYWORDS.join('|')

// Matches a section keyword + colon anywhere in the text (case-sensitive).
// Used to force every heading onto its own line, healing the bridge's glued
// concatenations.
const KEYWORD_COLON_RE = new RegExp(`(${KEYWORD_SOURCE})\\s*:`, 'g')

// Matches a numbered list marker ("1." … "10.") glued mid-text onto the
// preceding token, the way the bridge runs findings together
// ("...No apparent ICH2. Senile..." / "...vessel disease.3. Pan-paranasal...").
// Capture-group form (no lookbehind) for older Safari compatibility:
//   $1 = the char the marker is glued to (letter / CJK / sentence punctuation)
//   $2 = the marker itself ("2.")
// The lookahead requires a capital letter or CJK after the dot, which both
// starts a new item AND guarantees decimals ("0.5", where a digit follows the
// dot) are never split.
const GLUED_NUM_RE = /([A-Za-z一-鿿.;:)\]）】])\s*(\d{1,2}\.)(?=\s*[A-Z一-鿿])/g

// A line that *is* a section heading, optionally with inline content trailing
// the colon ("Recommendation: correlate with clinical finding").
const HEADING_LINE_RE = new RegExp(`^(${KEYWORD_SOURCE})\\s*:\\s*([\\s\\S]*)$`)

// Top-level numbered item: "1." / "10." but NOT a decimal like "0.5".
// The dot must be followed by whitespace, end-of-line, or a non-digit
// (letter / CJK / paren) so measurements are never split.
const NUM_DOT_RE = /^(\d{1,2})\.(?=\s|$|[^\d])\s*([\s\S]*)$/
// Sub item: "1)" / "2)" / "a)" / "(1)" / "(a)".
const SUB_PAREN_RE = /^\(?([0-9]{1,2}|[a-zA-Z])\)\s*([\s\S]*)$/
// Sub-sub item: a single capital letter + colon, e.g. "A:" / "B:".
const LETTER_COLON_RE = /^([A-Z])\s*:\s*([\s\S]*)$/
// Bullet markers.
const BULLET_RE = /^([-*•·])\s+([\s\S]*)$/

// Radiology narrative reports (chest X-ray, sonography) carry NO headings and NO
// numbers — they introduce findings with a verb + colon
// ("Radiography of Chest A-P View(Supine) Show:", "Sonar ... reveals:") and then
// run every finding together as period-separated sentences. Detect that lead-in
// so the findings can be split one-per-line. `[^.\n]*?` keeps the lead-in to the
// modality clause (which never contains a period) so we stop at the FIRST
// findings verb, not at a later sentence's period.
const FINDINGS_VERBS =
  'Shows?|Showed|Showing|Reveals?|Revealed|Revealing|Demonstrates?|Demonstrated|Demonstrating|Discloses?|Disclosed|Disclosing'
const FINDINGS_LEADIN_RE = new RegExp(`^([^.\\n]*?\\b(?:${FINDINGS_VERBS})\\s*:)\\s*([\\s\\S]+)$`, 'i')

/**
 * Split a run-on findings body into one finding per line. A break is inserted
 * after a period that ends a finding — i.e. preceded by a letter / ")" / "]"
 * (a real word end, never a decimal like "1.2" because the digit before the dot
 * is excluded) and followed, with or without whitespace, by the capital letter
 * or CJK char that starts the next finding. This heals both the spaced
 * ("field. Bilateral") and the bridge's glued ("field(s).Obliteration")
 * boundaries. The first replace heals the bridge's stray space-before-period
 * ("cardiomegaly ." → "cardiomegaly.").
 */
function segmentFindings(body: string): string[] {
  return body
    .replace(/\s+\./g, '.')
    .replace(/([A-Za-z)\]])\.\s*(?=[A-Z一-鿿])/g, '$1.\n')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Emit a body string into `lines`. When the body is a radiology findings
 * lead-in ("Radiography ... Show:Tortuosity..."), the lead-in is emitted at
 * `baseLevel` and each finding one level deeper. Otherwise the body is pushed
 * as a single line at `baseLevel`. Used for both standalone lines (baseLevel 0)
 * and the inline content trailing a section heading like "Conclusion:"
 * (baseLevel 1) — the bridge frequently wraps the whole findings list inside a
 * "Conclusion:" heading, so segmentation must reach there too.
 */
function pushBody(lines: ReportLine[], body: string, baseLevel: 0 | 1) {
  const fl = FINDINGS_LEADIN_RE.exec(body)
  if (fl) {
    lines.push({ text: fl[1].trim(), level: baseLevel })
    const findingLevel = (baseLevel + 1) as 1 | 2
    for (const finding of segmentFindings(fl[2])) {
      lines.push({ text: finding, level: findingLevel })
    }
    return
  }
  lines.push({ text: body.trim(), level: baseLevel })
}

/**
 * Parse a free-text report into structured, indentable lines.
 *
 * Always returns at least one line for non-blank input. When the text has no
 * recognisable structure it degrades gracefully to plain level-0 lines, which
 * render identically to a normal paragraph — so callers can use this
 * unconditionally without first sniffing for structure.
 */
export function formatReportText(raw: string): ReportLine[] {
  if (!raw || !raw.trim()) return []

  // 1) Force every section heading onto its own line, then break apart numbered
  //    findings the bridge ran together. Both heal glued concatenations so a
  //    plain line-split doesn't bury "Impression:" / "2." mid-sentence.
  const broken = raw
    .replace(KEYWORD_COLON_RE, (_m, kw) => `\n${kw}:`)
    .replace(GLUED_NUM_RE, (_m, before, marker) => `${before}\n${marker}`)

  // 2) Split, trim, drop blank lines (this also collapses the verbose blank
  //    runs the bridge pads reports with).
  const rawLines = broken
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  const lines: ReportLine[] = []
  for (const line of rawLines) {
    // Section heading, possibly carrying inline content after the colon.
    const h = HEADING_LINE_RE.exec(line)
    if (h) {
      const kw = h[1]
      const rest = h[2].trim()
      lines.push({ text: `${kw}:`, level: 0, heading: true })
      // Inline content after the colon — may itself be a findings lead-in the
      // bridge tucked under "Conclusion:" / "Findings:", so route it through
      // pushBody (segments findings) rather than pushing one flat line.
      if (rest) pushBody(lines, rest, 1)
      continue
    }

    // Top-level numbered item ("1." … "10."), decimal-guarded.
    const n = NUM_DOT_RE.exec(line)
    if (n) {
      lines.push({ text: n[2].trim(), level: 1, marker: `${n[1]}.` })
      continue
    }

    // Sub item "1)" / "a)" / "(1)".
    const s = SUB_PAREN_RE.exec(line)
    if (s) {
      lines.push({ text: s[2].trim(), level: 2, marker: `${s[1]})` })
      continue
    }

    // Sub-sub item "A:" / "B:".
    const lc = LETTER_COLON_RE.exec(line)
    if (lc) {
      lines.push({ text: lc[2].trim(), level: 2, marker: `${lc[1]}:` })
      continue
    }

    // Bullet "-" / "*" / "•".
    const b = BULLET_RE.exec(line)
    if (b) {
      lines.push({ text: b[2].trim(), level: 1, marker: '•' })
      continue
    }

    // Plain body / continuation line. pushBody also handles a standalone
    // radiology findings lead-in ("Radiography ... Show:Tortuosity...") — lead-in
    // flush at level 0, each finding indented at level 1. A structureless
    // multi-sentence paragraph WITHOUT a lead-in stays a single flush line.
    pushBody(lines, line, 0)
  }

  return lines
}
