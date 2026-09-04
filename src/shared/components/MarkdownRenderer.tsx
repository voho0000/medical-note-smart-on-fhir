// Markdown Renderer Component
import { memo, useMemo } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { splitMarkdownBlocks } from '@/src/shared/utils/markdown-blocks'
import { normalizeMarkdownEmphasisBoundaries } from '@/src/shared/utils/markdown-emphasis'

interface MarkdownRendererProps {
  content: string
  /** Preserve model-authored soft line breaks without changing markdown globally. */
  preserveSoftBreaks?: boolean
}

const COMPONENTS: Components = {
  h1: ({...props}) => <h1 className="text-lg font-bold border-b pb-1 mb-2" {...props} />,
  h2: ({...props}) => <h2 className="text-base font-bold mt-4 mb-2" {...props} />,
  h3: ({...props}) => <h3 className="text-sm font-semibold mt-3 mb-1" {...props} />,
  ul: ({...props}) => <ul className="list-disc pl-5 space-y-1" {...props} />,
  ol: ({...props}) => <ol className="list-decimal pl-5 space-y-1" {...props} />,
  li: ({...props}) => <li className="leading-relaxed" {...props} />,
  p: ({...props}) => <p className="leading-relaxed" {...props} />,
  a: ({...props}) => (
    <a
      className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    />
  ),
  code: ({inline, ...props}: any) =>
    inline ? (
      <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono" {...props} />
    ) : (
      <code className="block bg-muted p-2 rounded text-xs font-mono overflow-x-auto" {...props} />
    ),
  // Wide tables scroll inside their own container instead of crushing the
  // bubble/page: on a phone (root font 12px) a 5-column table forced to the
  // bubble width collapses a CJK column to one glyph per line. The fix is a
  // per-cell min-width floor (6rem, so it scales with the user's font setting)
  // rather than `w-max`: text still wraps at a readable width and the table
  // overflows only as far as the floor demands — measured at 375px, `w-max`
  // needed 595px of scrolling (pushing the row-label column off-screen) where
  // the floor needs 41px. `min-w-full` keeps a table that already fits spanning
  // the full width, and the floor sits below equal-share width, so tables with
  // room to spare are unchanged.
  table: ({...props}) => (
    <div className="w-full touch-pan-x touch-pan-y overflow-x-auto overscroll-x-contain [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30">
      <table
        className="min-w-full max-w-none table-auto border-collapse text-left [&_td]:min-w-[6rem] [&_td]:border-t [&_td]:border-border/60 [&_td]:px-2 [&_td]:py-1 [&_td]:align-top [&_th]:whitespace-nowrap [&_th]:px-2 [&_th]:py-1 [&_th]:font-semibold [&_th]:text-muted-foreground"
        {...props}
      />
    </div>
  ),
  strong: ({...props}) => <strong className="font-semibold" {...props} />,
  em: ({...props}) => <em className="italic" {...props} />,
  hr: ({...props}) => <hr className="my-3 border-border" {...props} />,
  blockquote: ({...props}) => <blockquote className="border-l-4 border-muted-foreground/30 pl-3 italic my-2" {...props} />,
}

// One markdown block, memoized by its text. While a reply streams in, only the
// trailing (still-growing) block's text changes, so React.memo skips re-parsing
// every already-completed block above it.
const MarkdownBlock = memo(function MarkdownBlock({ content }: { content: string }) {
  return (
    // Hardening: don't render images from markdown. Markdown/model output can
    // carry remote <img> URLs that the browser auto-fetches on render — an
    // unwanted outbound request from an app that holds patient data. The app's
    // real medical images render via dedicated (blob:) components, not markdown,
    // so there is no usability loss.
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={COMPONENTS}
      disallowedElements={['img']}
      unwrapDisallowed
    >
      {content}
    </ReactMarkdown>
  )
})

export const MarkdownRenderer = memo(function MarkdownRenderer({
  content,
  preserveSoftBreaks = false,
}: MarkdownRendererProps) {
  // Render block-by-block so streaming is cheap: splitting is O(n) but only the
  // last block is re-parsed per update (completed blocks are memoized), instead
  // of re-parsing the whole growing message every ~100ms — which is what froze
  // the main thread (and stalled the stream-reading loop, making replies look
  // slow) on long/fast responses.
  const blocks = useMemo(
    () => splitMarkdownBlocks(normalizeMarkdownEmphasisBoundaries(content)),
    [content],
  )
  return (
    <div className={`prose prose-sm max-w-none dark:prose-invert prose-headings:mt-3 prose-headings:mb-2 prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-1${preserveSoftBreaks ? ' whitespace-pre-wrap' : ''}`}>
      {blocks.map((block, i) => (
        <MarkdownBlock key={i} content={block} />
      ))}
    </div>
  )
})
