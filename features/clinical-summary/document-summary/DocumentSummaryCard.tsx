// DocumentSummaryCard
// Renders the human-readable narratives carried inside FHIR document
// resources. Today this covers two sources:
//
//   1. Composition  — typically IPS (International Patient Summary) imports.
//                     Multi-section structure; each section.text.div is
//                     sanitised XHTML rendered by CompositionRenderer.
//   2. DocumentReference — 健保存摺 discharge summaries via bridge v0.17.0+.
//                          A single self-contained HTML attachment per doc;
//                          rendered by HtmlDocumentRenderer.
//
// Both flow through the same DocumentEntry view-model and the card is
// source-agnostic — the per-entry header strip (type label, badges, date,
// institution, period) works the same way for either, and the renderer is
// dispatched on `entry.sourceKind`.
//
// Bridge sessions without any Composition / clinical-note DocumentReference
// hit the `isEmpty` branch and the card hides itself; the friendly empty
// state explains the feature so users know it exists once they import IPS
// or once the bridge ships discharge summaries.
"use client"

import { useMemo, useState } from 'react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Building2, Info, PanelRight } from 'lucide-react'
import { FeatureCard } from '@/src/shared/components'
import { cn } from '@/src/shared/utils/cn.utils'
import { useRightDetail } from '@/src/application/providers/right-detail.provider'
import { stripHtmlToText } from '@/src/core/utils/clinical-documents.utils'
import { decodeBase64Utf8 } from '@/src/shared/utils/base64.utils'
import { ReportInterpretationButton, ReportInterpretationPanel } from '@/features/report-interpretation'
import { useDocumentSummaries } from './hooks/useDocumentSummaries'
import { CompositionRenderer } from './components/CompositionRenderer'
import { HtmlDocumentRenderer, HtmlDocumentBody } from './components/HtmlDocumentRenderer'
import { DocumentDetailDialog } from './components/DocumentDetailDialog'
import { useDocumentSummaryStrings, makeResolveSectionLabel, type DocSummaryStrings } from './utils/strings'
import type { DocumentEntry } from './types'


function formatDate(iso?: string): string {
  if (!iso) return ''
  return iso.slice(0, 10)
}

/**
 * Build the period string for an entry's header — e.g. "2025-05-18 ~ 2025-05-22"
 * for a discharge summary, or empty when the entry has no period.
 */
function formatPeriod(period?: { start?: string; end?: string }): string {
  if (!period) return ''
  const start = formatDate(period.start)
  const end = formatDate(period.end)
  if (start && end && start !== end) return `${start} ~ ${end}`
  return start || end
}

export function DocumentSummaryCard() {
  const strings = useDocumentSummaryStrings()
  const { entries, isLoading, error } = useDocumentSummaries(strings.docTypes)
  const resolveSectionLabel = makeResolveSectionLabel(strings)

  const isEmpty = entries.length === 0
  // One-doc datasets auto-expand the body to save a click; multi-doc lists
  // stay collapsed so the card height doesn't balloon.
  const autoExpand = entries.length === 1

  return (
    <FeatureCard
      title={strings.title}
      featureId="document-summary"
      isLoading={isLoading}
      error={error}
      isEmpty={isEmpty}
      emptyMessage={strings.noData}
    >
      <div className="space-y-3">
        {/* Top hint with tooltip — explains the card's intent so clinicians
            don't mistake the narrative for a separate dataset. */}
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-[0.6875rem] text-muted-foreground hover:text-foreground"
              >
                <Info className="h-3 w-3" aria-hidden />
                <span>{strings.title}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="start" className="max-w-xs text-xs leading-relaxed">
              {strings.tooltip}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <ul className="space-y-2">
          {entries.map((entry) => (
            <DocumentEntryCard
              key={entry.id}
              entry={entry}
              autoExpand={autoExpand}
              strings={strings}
              resolveSectionLabel={resolveSectionLabel}
            />
          ))}
        </ul>
      </div>
    </FeatureCard>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Per-entry card — header strip (type + badges + institution + period +
// date) plus the source-specific renderer.
// ─────────────────────────────────────────────────────────────────────────
interface DocumentEntryCardProps {
  entry: DocumentEntry
  autoExpand: boolean
  strings: DocSummaryStrings
  resolveSectionLabel: (i18nKey: string) => string | null
}

function DocumentEntryCard({
  entry,
  autoExpand,
  strings,
  resolveSectionLabel,
}: DocumentEntryCardProps) {
  const dateStr = formatDate(entry.date)
  const periodStr = formatPeriod(entry.period)

  // 「AI 翻譯解讀」— on-demand per document (民眾 feature). Plain-text extraction
  // reuses the same strip-HTML path the clinical-context builder uses, so the
  // model gets the readable document text (not sanitised HTML / base64).
  const [interpretOpen, setInterpretOpen] = useState(false)
  const docPlainText = useMemo(() => {
    if (entry.sourceKind === 'composition' && entry.composition) {
      return (entry.composition.section ?? [])
        .map((s) => {
          const t = s.text?.div ? stripHtmlToText(s.text.div) : ''
          if (!t) return ''
          return s.title ? `${s.title}:\n${t}` : t
        })
        .filter(Boolean)
        .join('\n\n')
    }
    if (entry.attachment?.data) {
      const decoded = decodeBase64Utf8(entry.attachment.data)
      return decoded ? stripHtmlToText(decoded) : ''
    }
    return ''
  }, [entry])
  const canInterpret = docPlainText.trim().length > 0

  // 向右展開 — dock the full document (the same content the maximize dialog
  // shows) in the right pane to read it beside the list.
  const { detail: rightDetail, toggleDetail } = useRightDetail()
  const sourceId = `doc:${entry.id}`
  const isRightActive = rightDetail?.sourceId === sourceId
  const openRight = (e: React.SyntheticEvent) => {
    e.stopPropagation()
    toggleDetail({
      sourceId,
      title: (
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="truncate">{entry.typeLabel}</span>
          {(periodStr || (dateStr && !entry.period)) && (
            <span className="text-xs font-normal text-muted-foreground whitespace-nowrap">
              · {periodStr || dateStr}
            </span>
          )}
        </span>
      ),
      node: (
        <div key={sourceId} className="scrollbar-thin-persistent h-full overflow-y-auto pr-1">
          {/* 「AI 翻譯解讀」in the docked view — manual mode (shares the inline
              per-reportId cache), above the document body so a 民眾 sees the AI
              result first without scrolling. */}
          {canInterpret && (
            <ReportInterpretationPanel
              reportId={sourceId}
              reportText={docPlainText}
              reportTitle={entry.typeLabel}
              autoGenerate={false}
            />
          )}
          {entry.sourceKind === 'composition' && entry.composition ? (
            <CompositionRenderer
              composition={entry.composition}
              defaultExpandFirst
              resolveSectionLabel={resolveSectionLabel}
              labels={{
                documentDate: strings.documentDate,
                author: strings.author,
                custodian: strings.custodian,
                noSections: strings.noSections,
              }}
            />
          ) : entry.sourceKind === 'documentReference' && entry.attachment ? (
            <HtmlDocumentBody
              attachment={entry.attachment}
              labels={{ noContent: strings.htmlNoContent, externalUrl: strings.htmlExternalUrl }}
            />
          ) : null}
        </div>
      ),
    })
  }
  // div[role=button] (not <button>) so it can nest inside HtmlDocumentRenderer's
  // AccordionTrigger button without invalid HTML; mousedown stopProp keeps the
  // click from toggling the accordion. Desktop-only (no right pane on phones).
  const rightButton = (
    <div
      role="button"
      tabIndex={0}
      onClick={openRight}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          openRight(e)
        }
      }}
      title={isRightActive ? '已在右側面板展開' : '在右側面板展開文件'}
      aria-label="在右側面板展開文件"
      className={cn(
        'hidden md:inline-flex items-center rounded-md border px-1 py-0.5 cursor-pointer transition-colors',
        isRightActive
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <PanelRight className="h-3.5 w-3.5" />
    </div>
  )

  return (
    <li
      className={cn(
        'rounded-md border border-border/60 bg-muted/20 p-2.5 transition-colors',
        isRightActive && 'border-primary/40 bg-primary/5',
      )}
    >
      {/* Header strip: type label · IPS / discharge badge · date · maximize */}
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="truncate text-sm font-semibold">{entry.typeLabel}</span>
          {entry.isIps && (
            <span
              title={strings.ipsBadgeTooltip}
              className="inline-flex shrink-0 items-center rounded-full border border-indigo-200 bg-indigo-50 px-1.5 py-0 text-[0.625rem] font-medium text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300"
            >
              {strings.ipsBadge}
            </span>
          )}
          {/* Suppress the discharge badge when the type label already says
              出院病摘 — otherwise the badge is redundant noise. */}
          {entry.isDischargeSummary && entry.typeLabel !== strings.dischargeBadge && (
            <span
              title={strings.dischargeBadgeTooltip}
              className="inline-flex shrink-0 items-center rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0 text-[0.625rem] font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
            >
              {strings.dischargeBadge}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Document date — only render when there's no period to anchor the
              timeline. For DocumentReference 出院病摘 the bridge sets `date` to
              the day NHI indexed the document (typically discharge day +0/+1),
              which is essentially redundant with period.end and confused users
              into reading it as the discharge date. The recording timestamp is
              also visible inside the HTML body, so we lose nothing by dropping
              it here. For Composition (IPS) the date IS the only temporal
              anchor, so it stays. */}
          {dateStr && !entry.period && (
            <span className="text-[0.6875rem] tabular-nums text-muted-foreground">
              {dateStr}
            </span>
          )}
          {/* 「AI 翻譯解讀」— shown for any document with extractable text.
              Hidden while docked to the right pane (which owns the AI card
              there), so there's no duplicate left card / orphan button. */}
          {canInterpret && !isRightActive && (
            <ReportInterpretationButton
              active={interpretOpen}
              onToggle={(e) => {
                e.stopPropagation()
                setInterpretOpen((v) => !v)
              }}
            />
          )}
          {/* IPS compositions have per-section accordions (no single 文件內容
              chevron), so their 向右展開 button lives here in the header.
              Discharge summaries get it on the 文件內容 bar instead (below). */}
          {entry.sourceKind === 'composition' && rightButton}
          {/* Maximize button — opens the same content in a centred dialog
              at ~90vw so the discharge-summary tables breathe. The inline
              accordion below still works for quick previews. */}
          <DocumentDetailDialog
            entry={entry}
            strings={strings}
            resolveSectionLabel={resolveSectionLabel}
          />
        </div>
      </div>

      {/* Primary diagnosis — matches 健保存摺's 「疾病分類」line. Drawn from
          the linked Encounter.reasonCode[0]; for inpatient discharge summaries
          the bridge writes the principal diagnosis there.
          The ICD code is shown for BOTH audiences (medical & 民眾): the tooltip
          calls out that this is NHI's billing-side coding, not the clinician's
          narrative diagnosis, so users don't mistake the short label for the
          full clinical picture. */}
      {entry.primaryDiagnosis && (
        <div className="mb-1 flex items-baseline gap-1.5 text-[0.8125rem] font-medium text-foreground/90">
          {entry.primaryDiagnosis.code && (
            <span
              className="font-mono text-[0.6875rem] text-muted-foreground cursor-help"
              title={strings.primaryDiagnosisTooltip}
            >
              {entry.primaryDiagnosis.code}
            </span>
          )}
          <span title={strings.primaryDiagnosisTooltip} className="cursor-help">
            {entry.primaryDiagnosis.text}
          </span>
        </div>
      )}

      {/* Secondary line: institution + period (e.g. "長庚嘉義 · 2025-05-18 ~ 2025-05-22") */}
      {(entry.institution || periodStr) && (
        <div className="mb-1.5 flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground">
          {entry.institution && (
            <span className="inline-flex items-center gap-1">
              <Building2 className="h-3 w-3 shrink-0" aria-hidden />
              {entry.institution}
            </span>
          )}
          {entry.institution && periodStr && <span className="select-none">·</span>}
          {periodStr && <span className="tabular-nums">{periodStr}</span>}
        </div>
      )}

      {/* 「AI 翻譯解讀」panel — rendered ABOVE the document body so a 民眾 who
          only reads the AI result sees it immediately instead of having to
          scroll past (or expand) the original document. Auto-generates on open.
          Hidden while docked to the right pane (which shows the same card
          there), so the result isn't duplicated. */}
      {canInterpret && interpretOpen && !isRightActive && (
        <ReportInterpretationPanel
          reportId={`doc:${entry.id}`}
          reportText={docPlainText}
          reportTitle={entry.typeLabel}
        />
      )}

      {/* Source-specific renderer. Composition → per-section accordion,
          DocumentReference → single HTML-body accordion. */}
      {entry.sourceKind === 'composition' && entry.composition ? (
        <CompositionRenderer
          composition={entry.composition}
          defaultExpandFirst={autoExpand}
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
          defaultExpanded={autoExpand}
          rightControl={rightButton}
          labels={{
            bodyHeader: strings.htmlBodyHeader,
            noContent: strings.htmlNoContent,
            externalUrl: strings.htmlExternalUrl,
          }}
        />
      ) : null}
    </li>
  )
}
