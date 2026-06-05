// HtmlDocumentRenderer
// Renders a single HTML attachment (e.g. 健保存摺 出院病摘) inside the doc
// summary card. The base64 → text → DOMPurify pipeline runs lazily on
// expand so we don't pay the cost for documents the user never opens —
// a typical 健保存摺 dataset can carry many tens of discharge summaries.
//
// Differs from CompositionRenderer in that there is exactly ONE collapsible
// region per document (the whole HTML body) rather than a per-section
// accordion. That matches the source: a Composition has structured sections,
// a DocumentReference attachment is one self-contained document.
"use client"

import { useMemo, useState } from 'react'
import { FileText } from 'lucide-react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { sanitizeNarrative } from '../utils/sanitize-narrative'
import { decodeBase64Utf8 } from '../utils/base64'

interface HtmlDocumentRendererProps {
  attachment: {
    contentType?: string
    data?: string
    url?: string
    title?: string
    size?: number
  }
  /** Whether to expand the body by default. The card sets this to true when
   *  the dataset contains exactly one document, to save the user a click. */
  defaultExpanded?: boolean
  /** Labels for the empty / fallback states. */
  labels: {
    /** Header shown above the collapsible HTML body. */
    bodyHeader: string
    /** Shown when decode + sanitisation produce no visible content. */
    noContent: string
    /** Shown for url-only attachments (no inline data) — bridge doesn't ship
     *  these today but the FHIR spec allows them. */
    externalUrl: string
  }
}

export function HtmlDocumentRenderer({
  attachment,
  defaultExpanded = false,
  labels,
}: HtmlDocumentRendererProps) {
  // Track open state ourselves so we can defer the decode + sanitise pipeline
  // until the user actually expands the document. For a typical bundle with
  // ~tens of discharge summaries this turns a multi-MB eager parse into
  // sub-100KB per-open work.
  const [hasOpened, setHasOpened] = useState(defaultExpanded)

  const sanitised = useMemo(() => {
    if (!hasOpened) return ''
    if (!attachment.data) return ''
    const decoded = decodeBase64Utf8(attachment.data)
    if (!decoded) return ''
    return sanitizeNarrative(decoded)
  }, [hasOpened, attachment.data])

  const isExternal = !attachment.data && !!attachment.url
  const defaultValue = defaultExpanded ? 'body' : undefined

  return (
    <Accordion
      type="single"
      collapsible
      defaultValue={defaultValue}
      className="space-y-1.5"
      onValueChange={(v) => {
        if (v === 'body') setHasOpened(true)
      }}
    >
      <AccordionItem value="body" className="rounded-md border border-border/60 bg-background">
        {/* AccordionTrigger ships its own ChevronDown that auto-rotates via
            `[&[data-state=open]>svg]:rotate-180` (see components/ui/accordion).
            We use the default chevron so the open/closed state is visually
            unambiguous — important because the title is a neutral noun
            ("文件內容") rather than an action verb. */}
        <AccordionTrigger className="px-3 py-2 text-sm hover:no-underline">
          <div className="flex flex-1 items-center gap-2 min-w-0">
            <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate font-medium">{labels.bodyHeader}</span>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-3 pb-3">
          {isExternal ? (
            <a
              href={attachment.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary underline"
            >
              {labels.externalUrl}
            </a>
          ) : sanitised ? (
            // `table-layout: fixed` + the colgroup injected by
            // sanitizeNarrative is what actually forces tables to respect
            // the panel width. Without table-fixed the browser sizes <table>
            // by its cells' natural content widths and silently ignores
            // `max-width: 100%` when those widths sum to more than the
            // parent — that's why the long discharge-summary title row
            // pushed past the panel edge and triggered horizontal scroll.
            // The colgroup pins col 1 at 80px (label) and lets the remaining
            // columns share the rest. `break-words` + default CJK wrapping
            // handle any cell content that's still too long for its column.
            // `whitespace-pre-wrap` on <pre> preserves doctor-written line
            // breaks for the body sections the bridge originally shipped
            // inside <textarea> (stripped by DOMPurify, content kept).
            <div
              className="prose prose-sm dark:prose-invert max-w-none break-words [&_table]:w-full [&_table]:table-fixed [&_table]:text-xs [&_table]:border-collapse [&_td]:border [&_td]:border-border/40 [&_td]:px-1.5 [&_td]:py-0.5 [&_td]:align-top [&_td]:break-words [&_th]:border [&_th]:border-border/40 [&_th]:px-1.5 [&_th]:py-0.5 [&_th]:font-medium [&_th]:break-words [&_pre]:whitespace-pre-wrap [&_pre]:break-words"
              // eslint-disable-next-line react/no-danger -- sanitised via DOMPurify with the FHIR-Narrative whitelist
              dangerouslySetInnerHTML={{ __html: sanitised }}
            />
          ) : (
            <div className="text-xs italic text-muted-foreground">{labels.noContent}</div>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
