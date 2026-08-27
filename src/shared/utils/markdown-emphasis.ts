const TRAILING_LABEL_PUNCTUATION = '[:：;；,，。.!！?？、]'
const ASTERISK_LABEL_BOUNDARY = new RegExp(
  `(^|[^\\\\])\\*\\*([^*\\n]+?)(${TRAILING_LABEL_PUNCTUATION})\\*\\*(?=[\\p{L}\\p{N}])`,
  'gu',
)
const UNDERSCORE_LABEL_BOUNDARY = new RegExp(
  `(^|[^\\\\])__([^_\\n]+?)(${TRAILING_LABEL_PUNCTUATION})__(?=[\\p{L}\\p{N}])`,
  'gu',
)

function repairPlainMarkdown(segment: string): string {
  // CommonMark does not close emphasis in `**Label:**value`: the closing
  // delimiter is preceded by punctuation and immediately followed by a word.
  // Move only the trailing label punctuation outside the emphasis so the
  // visible text stays byte-for-byte equivalent while the intended bold label
  // becomes valid Markdown.
  return segment
    .replace(ASTERISK_LABEL_BOUNDARY, '$1**$2**$3')
    .replace(UNDERSCORE_LABEL_BOUNDARY, '$1__$2__$3')
}

function repairOutsideInlineCode(
  line: string,
  initialCodeDelimiterLength: number,
): { line: string; codeDelimiterLength: number } {
  let output = ''
  let plainStart = 0
  let codeDelimiterLength = initialCodeDelimiterLength
  let index = 0

  while (index < line.length) {
    if (line[index] !== '`') {
      index += 1
      continue
    }

    let runEnd = index + 1
    while (line[runEnd] === '`') runEnd += 1
    const runLength = runEnd - index

    if (codeDelimiterLength === 0) {
      output += repairPlainMarkdown(line.slice(plainStart, index))
      output += line.slice(index, runEnd)
      codeDelimiterLength = runLength
      plainStart = runEnd
    } else if (runLength === codeDelimiterLength) {
      output += line.slice(plainStart, runEnd)
      codeDelimiterLength = 0
      plainStart = runEnd
    }

    index = runEnd
  }

  output += codeDelimiterLength === 0
    ? repairPlainMarkdown(line.slice(plainStart))
    : line.slice(plainStart)
  return { line: output, codeDelimiterLength }
}

/**
 * Repair one common model-generated emphasis boundary without changing the
 * visible prose. Code spans and fenced code blocks remain exact source text.
 */
export function normalizeMarkdownEmphasisBoundaries(markdown: string): string {
  if (!markdown) return markdown

  let fenceMarker: '`' | '~' | null = null
  let fenceLength = 0
  let inlineCodeDelimiterLength = 0

  return markdown.split('\n').map((line) => {
    const fence = line.match(/^ {0,3}(`{3,}|~{3,})/)

    if (fenceMarker) {
      const closingFence = line.match(/^ {0,3}(`{3,}|~{3,})[\t ]*$/)
      if (
        closingFence
        && closingFence[1][0] === fenceMarker
        && closingFence[1].length >= fenceLength
      ) {
        fenceMarker = null
        fenceLength = 0
      }
      return line
    }

    if (fence && inlineCodeDelimiterLength === 0) {
      fenceMarker = fence[1][0] as '`' | '~'
      fenceLength = fence[1].length
      return line
    }

    const repaired = repairOutsideInlineCode(line, inlineCodeDelimiterLength)
    inlineCodeDelimiterLength = repaired.codeDelimiterLength
    return repaired.line
  }).join('\n')
}
