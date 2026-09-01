"use client"

import { useMemo } from 'react'
import { MarkdownRenderer } from '@/src/shared/components/MarkdownRenderer'
import type { InsightOutputFormat } from '@/src/shared/constants/clinical-insights.constants'
import { sanitizeInsightHtml } from '../utils/insight-content'

interface InsightContentRendererProps {
  content: string
  format: InsightOutputFormat
}

export function InsightContentRenderer({ content, format }: InsightContentRendererProps) {
  const sanitizedHtml = useMemo(
    () => format === 'html' ? sanitizeInsightHtml(content) : '',
    [content, format],
  )

  if (format === 'plain-text') {
    return (
      <pre className="m-0 whitespace-pre-wrap break-words font-sans text-[inherit] leading-[inherit]">
        {content}
      </pre>
    )
  }

  if (format === 'html') {
    return (
      <div
        className="max-w-full overflow-x-auto break-words [&_blockquote]:my-2 [&_blockquote]:border-l-4 [&_blockquote]:border-muted-foreground/30 [&_blockquote]:pl-3 [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-bold [&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:text-sm [&_h3]:font-semibold [&_li]:my-1 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_p]:leading-relaxed [&_pre]:whitespace-pre-wrap [&_table]:min-w-full [&_table]:border-collapse [&_td]:min-w-24 [&_td]:border-t [&_td]:border-border/60 [&_td]:px-2 [&_td]:py-1 [&_td]:align-top [&_th]:whitespace-nowrap [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold [&_th]:text-muted-foreground [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5"
        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
      />
    )
  }

  return <MarkdownRenderer content={content} />
}
