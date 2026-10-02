// 影像與病理重點 — every imaging and pathology report in the AI scope, each as
// one to three sentences of its own text. The model only picked the sentences;
// the app verified each one verbatim against the report before it got here,
// and wrote the date, title, hospital and modality itself. A row whose picks
// did not survive shows the report's conclusion section (or its opening) and
// says so, so a fallback never reads as an AI summary.
"use client"

import { useState } from "react"
import { ArrowUpRight, ChevronDown } from "lucide-react"
import { cn } from "@/src/shared/utils/cn.utils"
import type {
  ReportHighlight,
  ReportHighlightKind,
  ReportHighlights,
} from "@/src/core/entities/medical-summary.entity"
import type { ResourceNavTarget } from "@/src/application/stores/resource-navigation.store"
import { useLanguage } from "@/src/application/providers/language.provider"
import { formatOrganizationDisplay } from "@/src/shared/utils/organization-display"

/** Display order of the modality groups: tissue diagnosis first, then
 *  cross-sectional imaging, then the routine studies. */
export const REPORT_HIGHLIGHT_KIND_ORDER: readonly ReportHighlightKind[] = [
  "pathology",
  "pet",
  "ct",
  "mri",
  "echo",
  "us",
  "ecg",
  "xray",
  "other",
]

/** Newest reports shown per group before the "show more" toggle. */
const INITIAL_PER_GROUP = 3

const HAN = /[㐀-鿿]/

/** Quote marks that match the excerpt's own script — the excerpt stays in the
 *  report's original language, whatever the interface language is. */
function quoted(text: string, truncated: boolean): string {
  const body = truncated ? `${text}…` : text
  return HAN.test(text) ? `「${body}」` : `“${body}”`
}

export interface ReportHighlightsCardLabels {
  title: string
  subtitle: string
  kindLabels: Record<ReportHighlightKind, string>
  /** "{count}" placeholder. */
  showMore: string
  showLess: string
  conclusionTag: string
  openingTag: string
  /** "{count}" placeholder. */
  droppedQuotes: string
  /** "{count}" placeholder. */
  fallbackCount: string
}

interface ReportHighlightsCardProps {
  highlights: ReportHighlights
  labels: ReportHighlightsCardLabels
  onNavigate?: (target: ResourceNavTarget) => void
}

function groupByKind(items: readonly ReportHighlight[]) {
  const groups = new Map<ReportHighlightKind, ReportHighlight[]>()
  for (const item of items) {
    const group = groups.get(item.kind)
    if (group) group.push(item)
    else groups.set(item.kind, [item])
  }
  return REPORT_HIGHLIGHT_KIND_ORDER.flatMap((kind) => {
    const group = groups.get(kind)
    if (!group) return []
    return [{
      kind,
      items: [...group].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")),
    }]
  })
}

export function ReportHighlightsCard({ highlights, labels, onNavigate }: ReportHighlightsCardProps) {
  const { locale } = useLanguage()
  const [expanded, setExpanded] = useState<ReadonlySet<ReportHighlightKind>>(new Set())
  const items = highlights.items ?? []
  if (items.length === 0) return null

  const groups = groupByKind(items)
  const fallbackCount = items.length - highlights.aiSummarized
  const toggle = (kind: ReportHighlightKind) => setExpanded((current) => {
    const next = new Set(current)
    if (next.has(kind)) next.delete(kind)
    else next.add(kind)
    return next
  })

  return (
    <section
      className="rounded-lg border border-border bg-card px-3 py-2.5"
      aria-labelledby="medical-summary-reports-title"
    >
      <h3
        id="medical-summary-reports-title"
        className="mb-1.5 text-[0.6875rem] font-semibold tracking-wide text-muted-foreground"
      >
        {labels.title}
        <span className="ml-1 font-normal text-muted-foreground/80">{labels.subtitle}</span>
      </h3>

      <div className="space-y-2">
        {groups.map((group) => {
          const isExpanded = expanded.has(group.kind)
          const hiddenCount = Math.max(0, group.items.length - INITIAL_PER_GROUP)
          const visible = isExpanded ? group.items : group.items.slice(0, INITIAL_PER_GROUP)
          const headingId = `medical-summary-reports-${group.kind}`
          return (
            <div key={group.kind} role="group" aria-labelledby={headingId} data-report-kind={group.kind}>
              <h4
                id={headingId}
                className="flex items-baseline gap-1.5 border-b border-border pb-0.5 text-[0.6875rem] font-semibold text-foreground/80"
              >
                {labels.kindLabels[group.kind]}
                <span className="font-normal tabular-nums text-muted-foreground">{group.items.length}</span>
              </h4>
              <ul>
                {visible.map((item) => {
                  const organizationLabel = item.organization
                    ? formatOrganizationDisplay(item.organization, locale)
                    : ""
                  const fallbackTag = item.excerptSource === "conclusion"
                    ? labels.conclusionTag
                    : item.excerptSource === "opening"
                      ? labels.openingTag
                      : null
                  const inner = (
                    <div className="grid grid-cols-1 gap-x-2 @min-[24rem]:grid-cols-[5.5rem_minmax(0,1fr)] @min-[24rem]:items-baseline">
                      <span className="text-[0.6875rem] font-bold tabular-nums text-foreground/80">
                        {item.date ?? "—"}
                      </span>
                      <span className="min-w-0">
                        <span className="text-[0.8125rem] leading-snug text-foreground">
                          {item.title}
                          {organizationLabel ? (
                            <span className="ml-1 whitespace-nowrap rounded border border-border bg-muted/40 px-1.5 py-px text-[0.625rem] text-muted-foreground">
                              {organizationLabel}
                            </span>
                          ) : null}
                          {fallbackTag ? (
                            <span
                              className="ml-1 whitespace-nowrap rounded border border-dashed border-border px-1.5 py-px text-[0.625rem] text-muted-foreground"
                              data-excerpt-source={item.excerptSource}
                            >
                              {fallbackTag}
                            </span>
                          ) : null}
                          {onNavigate ? (
                            <ArrowUpRight className="ml-1 inline h-3 w-3 align-[-0.1em] text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100 max-md:opacity-60" />
                          ) : null}
                        </span>
                        {item.excerpts.map((excerpt, index) => (
                          <span
                            key={`${item.key}-${index}`}
                            className={cn(
                              "mt-0.5 block break-words text-[0.8125rem] leading-snug",
                              item.excerptSource === "ai" ? "text-foreground/90" : "text-muted-foreground",
                            )}
                          >
                            {quoted(excerpt, Boolean(item.excerptTruncated))}
                          </span>
                        ))}
                      </span>
                    </div>
                  )
                  return (
                    <li
                      key={item.key}
                      className="@container border-b border-border py-1 last:border-b-0"
                    >
                      {onNavigate ? (
                        // The whole row opens the report in the left panel, with
                        // its first excerpt as the pinpoint — same second-evidence
                        // pipeline as 最近 90 天.
                        <button
                          type="button"
                          onClick={() =>
                            onNavigate({
                              resourceType: item.resourceType,
                              resourceId: item.resourceId,
                              display: item.title,
                              date: item.date,
                              evidenceQuote: item.excerpts[0],
                            })
                          }
                          className="group -mx-1 -my-0.5 min-h-[44px] w-[calc(100%+0.5rem)] rounded-md px-1 py-0.5 text-left transition-colors hover:bg-muted/50 lg:min-h-8"
                        >
                          {inner}
                        </button>
                      ) : (
                        inner
                      )}
                    </li>
                  )
                })}
              </ul>
              {hiddenCount > 0 ? (
                <button
                  type="button"
                  onClick={() => toggle(group.kind)}
                  className="mt-0.5 flex min-h-[44px] items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground lg:min-h-8"
                  aria-expanded={isExpanded}
                >
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isExpanded && "rotate-180")} />
                  {isExpanded ? labels.showLess : labels.showMore.replace("{count}", String(hiddenCount))}
                </button>
              ) : null}
            </div>
          )
        })}
      </div>

      {highlights.droppedQuoteCount > 0 ? (
        <p className="mt-1.5 text-[0.65rem] text-muted-foreground/70">
          {labels.droppedQuotes.replace("{count}", String(highlights.droppedQuoteCount))}
        </p>
      ) : null}
      {fallbackCount > 0 ? (
        <p className="mt-0.5 text-[0.65rem] text-muted-foreground/70">
          {labels.fallbackCount.replace("{count}", String(fallbackCount))}
        </p>
      ) : null}
    </section>
  )
}
