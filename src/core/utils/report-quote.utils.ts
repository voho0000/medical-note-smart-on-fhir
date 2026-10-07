import { verifyDocumentQuote } from './document-evidence.utils'

/** Formatting tolerance for report excerpts only. Keep source offsets so the
 * displayed evidence is always the original, contiguous report wording. */
function normalizeReportExcerpt(text: string) {
  const chars: string[] = [], starts: number[] = [], ends: number[] = []
  const valueColon = (index: number) => /[A-Za-z]\s*$/.test(text.slice(0, index))
    && /^\s*[+\-−]?\d/.test(text.slice(index + 1))
  for (let i = 0; i < text.length;) {
    const start = i
    let char = text[i++]
    if (/\s/.test(char)) {
      while (i < text.length && /\s/.test(text[i])) i++
      // Space before a label/value colon, or between a number and a known
      // unit, is typography. Decimal points, signs and unit case stay intact.
      if (/[:：]/.test(text[i] ?? '') && valueColon(i)) continue
      if (/\d$/.test(text.slice(0, start)) && /^(?:mmHg|mm|cm|mg|g|mL|L|mmol|µg|μg|%)(?![A-Za-z])/.test(text.slice(i))) continue
      char = ' '
    } else if (/[:：]/.test(char) && valueColon(start)) char = ' '
    if (char === ' ' && (chars.length === 0 || chars.at(-1) === ' ')) continue
    chars.push(char); starts.push(start); ends.push(i)
  }
  if (chars.at(-1) === ' ') { chars.pop(); starts.pop(); ends.pop() }
  return { text: chars.join(''), starts, ends }
}

export function verifyReportQuote(quote: string, sourceText?: string): string | null {
  const strict = verifyDocumentQuote(quote, sourceText)
  if (strict.verification === 'exact' || strict.verification === 'whitespace-restored') return strict.quote
  if (!sourceText) return null
  const target = normalizeReportExcerpt(quote).text
  // The fallback must not make short fragments easier to match.
  if (target.length < 8) return null
  const source = normalizeReportExcerpt(sourceText)
  const index = source.text.indexOf(target)
  if (index < 0) return null
  return sourceText.slice(source.starts[index], source.ends[index + target.length - 1])
}
