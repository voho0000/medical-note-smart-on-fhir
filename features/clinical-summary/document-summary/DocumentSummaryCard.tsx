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

import { useMemo } from 'react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Building2, Info } from 'lucide-react'
import { useLanguage } from '@/src/application/providers/language.provider'
import { FeatureCard } from '@/src/shared/components'
import { useDocumentSummaries } from './hooks/useDocumentSummaries'
import { CompositionRenderer } from './components/CompositionRenderer'
import { HtmlDocumentRenderer } from './components/HtmlDocumentRenderer'
import type { DocumentEntry } from './types'

interface DocSummaryStrings {
  title: string
  noData: string
  documentDate: string
  author: string
  custodian: string
  noSections: string
  tooltip: string
  ipsBadge: string
  ipsBadgeTooltip: string
  dischargeBadge: string
  dischargeBadgeTooltip: string
  htmlBodyHeader: string
  htmlNoContent: string
  htmlExternalUrl: string
  primaryDiagnosisTooltip: string
  docTypes: Record<string, string>
  sections: Record<string, string>
}

const FALLBACK_STRINGS: DocSummaryStrings = {
  title: '文件摘要',
  noData: '目前尚無文件資料。匯入 IPS（國際病人摘要）或當健保存摺載入出院病摘後，文件內容將顯示於此。',
  documentDate: '文件日期',
  author: '作者',
  custodian: '機構',
  noSections: '本份文件未提供可顯示的敘事內容。',
  tooltip: '此處顯示匯入文件原始的人類可讀敘事內容（如 IPS 國際病人摘要、出院病摘）。當中的結構化資料已分別呈現在上方各卡片，本卡片保留原始敘事供對照或摘要參考。',
  ipsBadge: 'IPS',
  ipsBadgeTooltip: '此份文件依 IPS（國際病人摘要）規範產出。',
  dischargeBadge: '出院病摘',
  dischargeBadgeTooltip: '此份為 LOINC 18842-5 出院病摘。',
  htmlBodyHeader: '展開文件內容',
  htmlNoContent: '本份文件無可顯示的內容。',
  htmlExternalUrl: '開啟外部文件',
  primaryDiagnosisTooltip: '此 ICD-10 碼為醫療院所申報健保時提供的住院主診斷（健保署彙整後同步至健康存摺）。並非醫師直接撰寫的診斷敘述，詳細病情請展開文件內容。',
  docTypes: {},
  sections: {},
}

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
  const { t } = useLanguage()

  // Pull localised strings with safe fallbacks — the i18n bundle may be in
  // a partial rollout, so we always merge over FALLBACK_STRINGS.
  const strings = useMemo<DocSummaryStrings>(() => {
    const src = (t as any).documentSummary as Partial<DocSummaryStrings> | undefined
    return {
      ...FALLBACK_STRINGS,
      ...(src ?? {}),
      docTypes: { ...FALLBACK_STRINGS.docTypes, ...(src?.docTypes ?? {}) },
      sections: { ...FALLBACK_STRINGS.sections, ...(src?.sections ?? {}) },
    }
  }, [t])

  const { entries, isLoading, error } = useDocumentSummaries(strings.docTypes)

  const resolveSectionLabel = (i18nKey: string): string | null =>
    strings.sections[i18nKey] ?? null

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
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
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

  return (
    <li className="rounded-md border border-border/60 bg-muted/20 p-2.5">
      {/* Header strip: type label · IPS / discharge badge · date */}
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="truncate text-sm font-semibold">{entry.typeLabel}</span>
          {entry.isIps && (
            <span
              title={strings.ipsBadgeTooltip}
              className="inline-flex shrink-0 items-center rounded-full border border-indigo-200 bg-indigo-50 px-1.5 py-0 text-[10px] font-medium text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300"
            >
              {strings.ipsBadge}
            </span>
          )}
          {/* Suppress the discharge badge when the type label already says
              出院病摘 — otherwise the badge is redundant noise. */}
          {entry.isDischargeSummary && entry.typeLabel !== strings.dischargeBadge && (
            <span
              title={strings.dischargeBadgeTooltip}
              className="inline-flex shrink-0 items-center rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0 text-[10px] font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
            >
              {strings.dischargeBadge}
            </span>
          )}
        </div>
        {/* Document date — only render when there's no period to anchor the
            timeline. For DocumentReference 出院病摘 the bridge sets `date` to
            the day NHI indexed the document (typically discharge day +0/+1),
            which is essentially redundant with period.end and confused users
            into reading it as the discharge date. The recording timestamp is
            also visible inside the HTML body, so we lose nothing by dropping
            it here. For Composition (IPS) the date IS the only temporal
            anchor, so it stays. */}
        {dateStr && !entry.period && (
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {dateStr}
          </span>
        )}
      </div>

      {/* Primary diagnosis — matches 健保存摺's 「疾病分類」line. Drawn from
          the linked Encounter.reasonCode[0]; for inpatient discharge summaries
          the bridge writes the principal diagnosis there.
          The ICD code is shown for BOTH audiences (medical & 民眾): the tooltip
          calls out that this is NHI's billing-side coding, not the clinician's
          narrative diagnosis, so users don't mistake the short label for the
          full clinical picture. */}
      {entry.primaryDiagnosis && (
        <div className="mb-1 flex items-baseline gap-1.5 text-[13px] font-medium text-foreground/90">
          {entry.primaryDiagnosis.code && (
            <span
              className="font-mono text-[11px] text-muted-foreground cursor-help"
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
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
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
