import { Fragment, type ReactNode } from 'react'

interface HighlightTextProps {
  text: string
  /** The active search query; matches of it within `text` get wrapped in <mark>. */
  query?: string
  /** Optional className for the <mark>. Defaults to a subtle yellow that works
   *  in both light and dark themes. */
  markClassName?: string
}

/**
 * Renders `text` with case-insensitive matches of `query` wrapped in <mark>.
 * Plain substring matching (not regex) so special characters in user input are
 * safe. Returns the text unchanged when there's no query or no match — cheap
 * enough to drop into any search result row.
 */
export function HighlightText({ text, query, markClassName }: HighlightTextProps) {
  const q = query?.trim().toLowerCase()
  if (!q || !text) return <>{text}</>
  const lower = text.toLowerCase()
  if (!lower.includes(q)) return <>{text}</>

  const out: ReactNode[] = []
  let i = 0
  let key = 0
  while (i <= text.length) {
    const idx = lower.indexOf(q, i)
    if (idx === -1) {
      if (i < text.length) out.push(<Fragment key={key++}>{text.slice(i)}</Fragment>)
      break
    }
    if (idx > i) out.push(<Fragment key={key++}>{text.slice(i, idx)}</Fragment>)
    out.push(
      <mark
        key={key++}
        className={markClassName ?? 'rounded-[2px] bg-yellow-200 px-0.5 text-inherit dark:bg-yellow-500/30'}
      >
        {text.slice(idx, idx + q.length)}
      </mark>,
    )
    i = idx + q.length
  }
  return <>{out}</>
}
