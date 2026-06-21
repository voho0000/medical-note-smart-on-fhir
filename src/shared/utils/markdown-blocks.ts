/**
 * Split markdown into top-level blocks (separated by blank lines), keeping
 * fenced code blocks intact even when they contain blank lines.
 *
 * Why: streaming markdown renderers freeze the UI when they re-parse the whole
 * growing message on every token (cost O(n) per update, n grows → ~O(n²) over
 * a reply, which also stalls the stream-reading loop so the reply looks slow).
 * By splitting into blocks and memoizing each by its text, a streaming reply
 * only re-parses the trailing (still-growing) block — completed blocks are
 * frozen — so each update is O(last block) instead of O(whole message).
 *
 * Caveat: a "loose" list (blank lines between items) splits into separate
 * lists. AI clinical output rarely uses loose lists and the visual difference
 * is negligible; tables and tight lists (no internal blank lines) are
 * unaffected because they contain no blank lines.
 */
export function splitMarkdownBlocks(md: string): string[] {
  if (!md) return []
  const lines = md.split('\n')
  const blocks: string[] = []
  let current: string[] = []
  let inFence = false

  const flush = () => {
    if (current.length === 0) return
    const text = current.join('\n')
    if (text.trim()) blocks.push(text)
    current = []
  }

  for (const line of lines) {
    // A line opening or closing a fenced code block (``` or ~~~). Toggling on
    // each fence line keeps blank lines *inside* a code block from splitting it.
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence
      current.push(line)
      continue
    }
    if (!inFence && line.trim() === '') {
      flush()
      continue
    }
    current.push(line)
  }
  flush()
  return blocks
}
