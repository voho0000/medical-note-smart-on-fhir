// Markdown Renderer Component
import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface MarkdownRendererProps {
  content: string
}

export const MarkdownRenderer = memo(function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:mt-3 prose-headings:mb-2 prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-1">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({node, ...props}) => <h1 className="text-lg font-bold border-b pb-1 mb-2" {...props} />,
          h2: ({node, ...props}) => <h2 className="text-base font-bold mt-4 mb-2" {...props} />,
          h3: ({node, ...props}) => <h3 className="text-sm font-semibold mt-3 mb-1" {...props} />,
          ul: ({node, ...props}) => <ul className="list-disc pl-5 space-y-1" {...props} />,
          ol: ({node, ...props}) => <ol className="list-decimal pl-5 space-y-1" {...props} />,
          li: ({node, ...props}) => <li className="leading-relaxed" {...props} />,
          p: ({node, ...props}) => <p className="leading-relaxed" {...props} />,
          a: ({node, ...props}) => (
            <a 
              className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer" 
              target="_blank" 
              rel="noopener noreferrer"
              {...props} 
            />
          ),
          code: ({node, inline, ...props}: any) => 
            inline ? (
              <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono" {...props} />
            ) : (
              <code className="block bg-muted p-2 rounded text-xs font-mono overflow-x-auto" {...props} />
            ),
          strong: ({node, ...props}) => <strong className="font-semibold" {...props} />,
          em: ({node, ...props}) => <em className="italic" {...props} />,
          hr: ({node, ...props}) => <hr className="my-3 border-border" {...props} />,
          blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-muted-foreground/30 pl-3 italic my-2" {...props} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
})
