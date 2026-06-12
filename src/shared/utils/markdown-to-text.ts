// Markdown → plain text for clipboard export (audit D2).
//
// Generated notes are markdown, but the destination is the EHR's plain-text
// note editor — raw `**`/`#` noise there is worse than losing emphasis. This
// is a pragmatic stripper for the markdown the LLMs actually emit (headers,
// emphasis, lists, links, tables, fences), not a full CommonMark parser.

export function markdownToPlainText(markdown: string): string {
  let text = markdown

  // Code fences: drop the ``` lines, keep the code itself
  text = text.replace(/^```[\w-]*\s*$/gm, '')
  // Table separator rows (|---|:--:|)
  text = text.replace(/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/gm, '')
  // Table cell pipes → tabs
  text = text
    .replace(/^\s*\|/gm, '')
    .replace(/\|\s*$/gm, '')
    .replace(/\s*\|\s*/g, '\t')
  // Images and links → their text
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  // Headers
  text = text.replace(/^#{1,6}\s+/gm, '')
  // Bold / italic / inline code
  text = text.replace(/(\*\*|__)(.*?)\1/g, '$2')
  text = text.replace(/(^|\s)[*_](\S(?:.*?\S)?)[*_](?=\s|$|[,.;:!?])/gm, '$1$2')
  text = text.replace(/`([^`]+)`/g, '$1')
  // Blockquotes
  text = text.replace(/^>\s?/gm, '')
  // Normalize list bullets (*, +) to "- ", keep indentation
  text = text.replace(/^(\s*)[*+]\s+/gm, '$1- ')
  // Horizontal rules
  text = text.replace(/^ {0,3}([-*_] *){3,}$/gm, '')
  // Collapse excess blank lines left by removals
  text = text.replace(/\n{3,}/g, '\n\n')

  return text.trim()
}
