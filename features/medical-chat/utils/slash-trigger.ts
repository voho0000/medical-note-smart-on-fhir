// Core logic for the "/shortcut" template trigger (Epic SmartPhrase / dotflow
// style, but slash-triggered). Pure functions — no React, no DOM — so the
// behaviour is unit-testable and the UI layer stays thin.

export interface SlashToken {
  /** The text typed after the slash, e.g. "soa" for "/soa" (no leading slash). */
  query: string
  /** Index of the '/' in the source text. */
  start: number
  /** Index just past the token (the caret position). */
  end: number
}

export interface SlashTemplate {
  id: string
  /** Display label (template/prompt title). */
  label: string
  /** Optional explicit trigger keyword, e.g. "soap" for /soap. */
  shortcut?: string
  /** The text that replaces the token when chosen. */
  body: string
  /** Where it came from — "personal" | "gallery" — for an optional badge. */
  source?: string
}

const WORD = /[\w-]/ // letters, digits, underscore, hyphen — a shortcut charset

/**
 * Returns the active "/keyword" token immediately before the caret, or null.
 *
 * Rules (kept strict so it doesn't fire mid-word or inside URLs/paths):
 *  - the '/' is at the very start of the text OR right after whitespace
 *  - the token is '/' followed by word chars, with no space before the caret
 *  - an empty query ("/" just typed) is valid → the menu shows everything
 */
export function detectSlashToken(text: string, caret: number): SlashToken | null {
  if (caret < 0 || caret > text.length) return null
  let i = caret
  while (i > 0 && WORD.test(text[i - 1])) i--
  // text[i-1] must be the slash that opens the token.
  if (i === 0 || text[i - 1] !== '/') return null
  const slashIdx = i - 1
  // The slash must start the input or follow whitespace — not e.g. "http://".
  if (slashIdx > 0 && !/\s/.test(text[slashIdx - 1])) return null
  return { query: text.slice(i, caret), start: slashIdx, end: caret }
}

/**
 * Filters + ranks templates for a query. Shortcut prefix beats title prefix
 * beats substring. An empty query returns everything (in original order).
 */
export function matchTemplates(items: SlashTemplate[], query: string): SlashTemplate[] {
  const q = query.trim().toLowerCase()
  if (!q) return items
  const score = (t: SlashTemplate): number => {
    const sc = (t.shortcut || '').toLowerCase()
    const lb = t.label.toLowerCase()
    if (sc === q) return 4
    if (sc.startsWith(q)) return 3
    if (lb.startsWith(q)) return 2
    if (sc.includes(q) || lb.includes(q)) return 1
    return 0
  }
  return items
    .map((t, i) => ({ t, s: score(t), i }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.t)
}

/**
 * Replaces the token range with `body`, returning the new text and the caret
 * position just after the inserted body.
 */
export function applyTemplate(text: string, token: SlashToken, body: string): { text: string; caret: number } {
  const before = text.slice(0, token.start)
  const after = text.slice(token.end)
  return { text: before + body + after, caret: before.length + body.length }
}
