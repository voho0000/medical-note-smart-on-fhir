// DocumentDetailDialog
// "Open in dialog" reader for a single document entry. Mirrors the 健康存摺
// pattern: the sidebar list gives a quick header + collapsible preview,
// but for actually reading a discharge summary the user clicks Maximize
// to pop the full content into a centred modal at ~90% of the viewport.
// The wider viewport eliminates the ~577px panel constraint that crams
// the diagnosis tables on the inline accordion.
//
// Trigger is rendered as `children`; the parent (DocumentSummaryCard)
// supplies a button slot in the entry header. Dialog content reuses the
// existing CompositionRenderer / HtmlDocumentRenderer so all the
// table-fixed + colgroup + DOMPurify pipeline still applies.
"use client"

import { useState } from "react"
import { Building2, FileText, Maximize2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { CompositionRenderer } from "./CompositionRenderer"
import { HtmlDocumentRenderer } from "./HtmlDocumentRenderer"
import type { DocumentEntry } from "../types"

interface DocumentDetailDialogProps {
  entry: DocumentEntry
  /** Localised strings forwarded to the inner renderers. The parent already
   *  resolves these from i18n, so we accept them as-is to avoid coupling
   *  this dialog to the language provider. */
  strings: {
    title: string
    documentDate: string
    author: string
    custodian: string
    noSections: string
    ipsBadge: string
    ipsBadgeTooltip: string
    dischargeBadge: string
    dischargeBadgeTooltip: string
    htmlBodyHeader: string
    htmlNoContent: string
    htmlExternalUrl: string
    openInDialog: string
  }
  resolveSectionLabel: (i18nKey: string) => string | null
}

function formatDate(iso?: string): string {
  if (!iso) return ''
  return iso.slice(0, 10)
}

function formatPeriod(period?: { start?: string; end?: string }): string {
  if (!period) return ''
  const start = formatDate(period.start)
  const end = formatDate(period.end)
  if (start && end && start !== end) return `${start} ~ ${end}`
  return start || end
}

export function DocumentDetailDialog({
  entry,
  strings,
  resolveSectionLabel,
}: DocumentDetailDialogProps) {
  const [open, setOpen] = useState(false)

  const periodStr = formatPeriod(entry.period)
  const dateStr = formatDate(entry.date)

  // Build a sentence-style header that mirrors the inline metadata strip but
  // reads naturally as a dialog title.
  const headerParts: string[] = []
  if (entry.institution) headerParts.push(entry.institution)
  if (periodStr) headerParts.push(periodStr)
  else if (dateStr && !entry.period) headerParts.push(dateStr)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={strings.openInDialog}
        aria-label={strings.openInDialog}
        className="inline-flex shrink-0 items-center justify-center rounded-md border border-border/60 bg-background p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        <Maximize2 className="h-3.5 w-3.5" aria-hidden />
      </button>

      <DialogContent
        className="sm:max-w-[min(90vw,1100px)] max-h-[90vh] flex flex-col gap-0 p-0"
      >
        {/* Header — type label + IPS/discharge badge + primary diagnosis
            + institution / period. Mirrors the inline list header so the
            user keeps their context when popping out the full document. */}
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle className="flex flex-wrap items-center gap-2 pr-8">
            <FileText className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
            <span>{entry.typeLabel}</span>
            {entry.isIps && (
              <span
                title={strings.ipsBadgeTooltip}
                className="inline-flex shrink-0 items-center rounded-full border border-indigo-200 bg-indigo-50 px-1.5 py-0 text-[10px] font-medium text-indigo-700"
              >
                {strings.ipsBadge}
              </span>
            )}
            {entry.isDischargeSummary && entry.typeLabel !== strings.dischargeBadge && (
              <span
                title={strings.dischargeBadgeTooltip}
                className="inline-flex shrink-0 items-center rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0 text-[10px] font-medium text-emerald-700"
              >
                {strings.dischargeBadge}
              </span>
            )}
          </DialogTitle>
          {entry.primaryDiagnosis && (
            <div className="flex items-baseline gap-1.5 text-sm font-medium text-foreground/90">
              {entry.primaryDiagnosis.code && (
                <span className="font-mono text-xs text-muted-foreground">
                  {entry.primaryDiagnosis.code}
                </span>
              )}
              <span>{entry.primaryDiagnosis.text}</span>
            </div>
          )}
          {headerParts.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {entry.institution && (
                <span className="inline-flex items-center gap-1">
                  <Building2 className="h-3 w-3 shrink-0" aria-hidden />
                  {entry.institution}
                </span>
              )}
              {entry.institution && (periodStr || dateStr) && <span className="select-none">·</span>}
              {periodStr ? (
                <span className="tabular-nums">{periodStr}</span>
              ) : dateStr ? (
                <span className="tabular-nums">{dateStr}</span>
              ) : null}
            </div>
          )}
        </DialogHeader>

        {/* Body — wrapped in ScrollArea so long discharge summaries scroll
            vertically inside the dialog without growing past 90vh. Padding
            keeps the doc's content away from the close button corner. */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-5 py-4">
            {entry.sourceKind === 'composition' && entry.composition ? (
              <CompositionRenderer
                composition={entry.composition}
                defaultExpandFirst={true}
                resolveSectionLabel={resolveSectionLabel}
                labels={{
                  documentDate: strings.documentDate,
                  author: strings.author,
                  custodian: strings.custodian,
                  noSections: strings.noSections,
                }}
              />
            ) : entry.sourceKind === 'documentReference' && entry.attachment ? (
              <HtmlDocumentRenderer
                attachment={entry.attachment}
                defaultExpanded={true}
                labels={{
                  bodyHeader: strings.htmlBodyHeader,
                  noContent: strings.htmlNoContent,
                  externalUrl: strings.htmlExternalUrl,
                }}
              />
            ) : null}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
