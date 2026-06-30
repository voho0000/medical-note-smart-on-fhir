// Markdown Renderer Component
import { memo, useMemo } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { splitMarkdownBlocks } from '@/src/shared/utils/markdown-blocks'

interface MarkdownRendererProps {
  content: string
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

export const MarkdownRenderer = memo(function MarkdownRenderer({ content }: MarkdownRendererProps) {
  // Render block-by-block so streaming is cheap: splitting is O(n) but only the
  // last block is re-parsed per update (completed blocks are memoized), instead
  // of re-parsing the whole growing message every ~100ms — which is what froze
  // the main thread (and stalled the stream-reading loop, making replies look
  // slow) on long/fast responses.
  const blocks = useMemo(() => splitMarkdownBlocks(content), [content])
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:mt-3 prose-headings:mb-2 prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-1">
      {blocks.map((block, i) => (
        <MarkdownBlock key={i} content={block} />
      ))}
    </div>
  )
})
