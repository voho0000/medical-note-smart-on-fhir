// Report Row Component
import { useState, memo } from 'react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { TrendingUp, Building2, AlertCircle, Copy, Check, ChevronDown, ImageIcon } from 'lucide-react'
import { cn } from "@/src/shared/utils/cn.utils"
import type { Row, Observation } from '../types'
import { getValueWithUnit, getReferenceRangeText } from '../utils/fhir-helpers'
import { getInterpretationTag, checkReferenceRangeAbnormal } from '../utils/interpretation-helpers'
import { ObservationBlock } from './ObservationBlock'
import { ObservationTrendDialog } from './ObservationTrendDialog'
import { HighlightText } from '@/src/shared/components/HighlightText'
import { ReportImageDialog } from './ReportImageDialog'
import { FormattedReportText } from './FormattedReportText'
import { MultiRegionStudyCard } from './MultiRegionStudyCard'

/** Small badge surfaced on a Row's header when bridge sent N duplicate
 *  DRs that the SMART app merged via strict-prefix dedup. Without this
 *  badge the merge would silently hide a bridge-side dedup miss (full-
 *  width slash slip, dictation-system whitespace inconsistency, mid-
 *  sentence upload truncation). Tooltip explains so the user can file
 *  the bridge report. */
function BridgeDupBadge({ count }: { count: number }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0 text-[10px] font-medium text-amber-800 cursor-help"
          aria-label={`Bridge sent ${count + 1} duplicate copies; merged into one`}
        >
          ⚠ bridge dup ×{count}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs leading-relaxed">
        健保署送出 {count + 1} 份內容相同（或截斷版）的副本，本 App 已自動保留最完整一份顯示。如需追蹤可回報 bridge 端 dedup 漏網。
      </TooltipContent>
    </Tooltip>
  )
}

interface ReportRowProps {
  row: Row
  defaultOpen: string[]
  /** Active search query — highlights matches in the report title. */
  query?: string
}

function formatDisplayDate(date?: string, showTime?: boolean): string {
  if (!date) return ''
  try {
    const d = new Date(date)
    if (showTime) {
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
    return d.toLocaleDateString()
  } catch {
    return date
  }
}

// Collapse repeated blank lines so verbose hospital-report text doesn't waste
// vertical space when expanded inline. Keeps single line breaks intact.
function compactBlankLines(s: string): string {
  return (s || '').replace(/(\r?\n)[ \t]*(?:\r?\n)+/g, '\n').trim()
}

function countAbnormal(obs: Observation[]): number {
  let count = 0
  for (const o of obs) {
    const tag = getInterpretationTag(o.interpretation)
    if ((tag && tag.label !== 'Normal') || checkReferenceRangeAbnormal(o)) {
      count++
      continue
    }
    if (Array.isArray(o.component)) {
      for (const c of o.component) {
        const ctag = getInterpretationTag(c.interpretation)
        if ((ctag && ctag.label !== 'Normal') || checkReferenceRangeAbnormal(c)) {
          count++
          break
        }
      }
    }
  }
  return count
}

function ReportRowImpl({ row, defaultOpen, query }: ReportRowProps) {
  const [trendDialogOpen, setTrendDialogOpen] = useState(false)
  // Separate "mounted" flag so the dialog (and its expensive history hooks)
  // only enter the React tree after the user actually opens it the first
  // time. We keep it mounted afterwards so re-opening is instant.
  const [trendDialogMounted, setTrendDialogMounted] = useState(false)
  const openTrendDialog = () => {
    setTrendDialogMounted(true)
    setTrendDialogOpen(true)
  }
  // Image lightbox — same lazy-mount discipline as the trend dialog: only enter
  // the tree (and decode the multi-MB base64) after the user clicks the
  // indicator. Kept mounted afterwards; the dialog itself revokes its Blob URLs
  // whenever it closes, so memory is released without unmounting.
  const [imageDialogOpen, setImageDialogOpen] = useState(false)
  const [imageDialogMounted, setImageDialogMounted] = useState(false)
  const openImageDialog = () => {
    setImageDialogMounted(true)
    setImageDialogOpen(true)
  }
  const [textExpanded, setTextExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      console.warn('[ReportRow] Clipboard copy failed', err)
    }
  }

  // A procedure's details (status, date, performer, NHI/PCS codes, reason) live
  // as components on the synthetic observation at index 0 — keep it. (It used to
  // be sliced off, which left bridge ≥0.18.14 procedures — that carry no related
  // observations — showing "0 項" with an empty body.)
  const displayObs = row.obs
  const firstObs = row.obs[0]

  const images = row.images
  const hasImages = !!images && images.length > 0

  // Inline-image indicator. Clicking opens the lazy lightbox. `stopProp` is set
  // when the button lives inside an AccordionTrigger so the click doesn't also
  // toggle the accordion (mirrors TrendButton).
  const ImageButton = ({ stopProp }: { stopProp?: boolean }) => (
    <div
      onClick={(e) => {
        if (stopProp) e.stopPropagation()
        openImageDialog()
      }}
      className="inline-flex items-center gap-0.5 text-muted-foreground hover:text-primary transition-colors cursor-pointer shrink-0"
      role="button"
      tabIndex={0}
      aria-label="查看影像"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          if (stopProp) e.stopPropagation()
          openImageDialog()
        }
      }}
    >
      <ImageIcon className="h-4 w-4" />
      {images!.length > 1 && <span className="text-xs tabular-nums">{images!.length}</span>}
    </div>
  )

  // Computed element (not an inner component) so the same reference is dropped
  // into whichever return branch renders — a `() => <Dialog/>` inner component
  // would get a fresh identity each render and remount the dialog (re-decoding
  // images, losing open state). Mirrors how the trend dialog is inlined.
  const imageLightbox = imageDialogMounted && hasImages ? (
    <ReportImageDialog
      images={images!}
      title={row.title}
      open={imageDialogOpen}
      onOpenChange={setImageDialogOpen}
    />
  ) : null

  const isSingleValue =
    displayObs.length === 1 &&
    (!(displayObs[0].component) || displayObs[0].component.length === 0)

  const TrendButton = ({ stopProp }: { stopProp?: boolean }) => (
    <div
      onClick={(e) => {
        if (stopProp) e.stopPropagation()
        openTrendDialog()
      }}
      className="text-muted-foreground hover:text-primary transition-colors cursor-pointer"
      role="button"
      tabIndex={0}
      aria-label="查看趨勢"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          if (stopProp) e.stopPropagation()
          openTrendDialog()
        }
      }}
    >
      <TrendingUp className="h-4 w-4" />
    </div>
  )

  // Single-value report: compact display
  if (isSingleValue) {
    const obs = displayObs[0]
    const interp = getInterpretationTag(obs.interpretation)
    const isAbnormal = (!!interp && interp.label !== 'Normal') || checkReferenceRangeAbnormal(obs)
    const refText = getReferenceRangeText(obs.referenceRange)
    // Synthetic narrative obs from text-based DiagnosticReports (imaging / ECG /
    // pathology) carry code.text === 'Report Summary'. These are ALWAYS routed to
    // the expandable long-text branch regardless of length — a short ECG
    // conclusion ("Sinus rhythm") must still be fully readable + expandable, not
    // truncated to one line behind a hover tooltip like a short lab string value.
    const isReportSummary = obs.code?.text === 'Report Summary'
    const isLongText = !obs.valueQuantity && ((obs.valueString?.length ?? 0) > 80 || isReportSummary)

    const dateLabel = formatDisplayDate(row.effectiveDate, row.showTime)
    const metaWithDate = row.meta + (dateLabel ? ` • ${dateLabel}` : '')

    // Date-only badge + institution inline, consistent with the single-value
    // and accordion rows. Category/status (e.g. "Radiology • final") are noise
    // in this dataset — they live on the badge's hover tooltip instead.
    // bridgeDupCount badge surfaces bridge-side dedup misses so the bug
    // doesn't get silently hidden by our merge (no-mask-bridge-bugs rule).
    const HeaderRight = () => (
      <div className="flex items-center gap-2 shrink-0">
        {row.bridgeDupCount && row.bridgeDupCount > 0 ? <BridgeDupBadge count={row.bridgeDupCount} /> : null}
        {row.institution && (
          <span className="inline-flex items-center gap-1 text-xs text-blue-600/80 dark:text-blue-400/80 min-w-0 max-w-[6rem]">
            <Building2 className="h-3 w-3 shrink-0" />
            <span className="truncate">{row.institution}</span>
          </span>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="text-xs font-normal whitespace-nowrap">{dateLabel || metaWithDate}</Badge>
          </TooltipTrigger>
          <TooltipContent>{metaWithDate}</TooltipContent>
        </Tooltip>
      </div>
    )

    // Long text (ECG conclusion, CT description): collapsed shows truncated preview,
    // header row toggles open/close (mirrors the multi-item accordion below).
    // Body text stays selectable; a Copy button shows when expanded.
    if (isLongText) {
      const fullText = compactBlankLines(obs.valueString || '')
      // Image-only imaging reports (X-ray / ECG with empty conclusion) reach
      // this branch via the synthetic "Report Summary" obs but carry no text —
      // render just the header (title + image indicator), with no toggle,
      // chevron, or empty expandable.
      const hasText = fullText.length > 0
      return (
        <>
          <div className="rounded-lg border bg-muted/40 px-3 py-2">
            <div
              className={cn(
                'flex items-center justify-between gap-2 mb-1 rounded-md transition-all outline-none',
                hasText && 'cursor-pointer select-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50'
              )}
              role={hasText ? 'button' : undefined}
              tabIndex={hasText ? 0 : undefined}
              aria-expanded={hasText ? textExpanded : undefined}
              onClick={(e) => {
                if (!hasText) return
                if ((e.target as HTMLElement).closest('[aria-label="查看趨勢"]')) return
                if ((e.target as HTMLElement).closest('[aria-label="查看影像"]')) return
                setTextExpanded(!textExpanded)
              }}
              onKeyDown={(e) => {
                if (!hasText) return
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setTextExpanded(!textExpanded)
                }
              }}
            >
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-sm font-semibold text-foreground truncate"><HighlightText text={row.title} query={query} /></span>
                  </TooltipTrigger>
                  <TooltipContent>{row.title}</TooltipContent>
                </Tooltip>
                <TrendButton />
                {hasImages && <ImageButton />}
              </div>
              <div className="flex items-center gap-2">
                <HeaderRight />
                {row.isPossibleDuplicate && (
                  <span className="text-xs text-amber-600 dark:text-amber-400 shrink-0">⚠ 可能重複</span>
                )}
                {hasText && (
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 shrink-0 text-muted-foreground pointer-events-none transition-transform duration-200',
                      textExpanded && 'rotate-180'
                    )}
                  />
                )}
              </div>
            </div>
            {hasText && (
              textExpanded ? (
                <FormattedReportText text={fullText} className="text-xs leading-relaxed text-foreground/80" />
              ) : (
                <p
                  className="line-clamp-1 cursor-pointer text-xs leading-relaxed text-foreground/80"
                  onClick={() => setTextExpanded(true)}
                >
                  {obs.valueString}
                </p>
              )
            )}
            {hasText && textExpanded && (
              <div className="mt-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleCopy(fullText)
                  }}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                  aria-label="複製報告全文"
                >
                  {copied ? (
                    <>
                      <Check className="h-3 w-3" />
                      已複製
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      複製全文
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
          {imageLightbox}
          {trendDialogMounted && (
            <ObservationTrendDialog
              observation={firstObs}
              reportTitle={row.title}
              reportLookupTitle={row.rawTitle}
              open={trendDialogOpen}
              onOpenChange={setTrendDialogOpen}
            />
          )}
        </>
      )
    }

    // Numeric or short text: single-row compact display
    const value = obs.valueQuantity
      ? getValueWithUnit(obs.valueQuantity)
      : obs.valueString || '—'

    // For string results the bridge often emits a "reference range" that just
    // repeats the result verbatim (e.g. value "Target Not Detected" with ref
    // "[Target Not Detected]"). Hide that redundant copy — it only steals width
    // from the report name. Numeric ranges (e.g. "[0.27–4.2]") are kept.
    const normRef = refText.replace(/[[\]]/g, '').trim()
    const showRef = !!refText && normRef !== (obs.valueString || '').trim()

    // Single line by design: the row stays compact and overflow shows an
    // ellipsis. The name has priority — it gets the flexible width — while the
    // value and institution are capped/truncate first (full text on hover) and
    // the date stays fully visible. Keeps a long report name like "Nucleic acid
    // amplification (DNA), quantitative" readable instead of collapsing to "Nu…".
    return (
      <>
        <div
          className={cn(
            'flex items-center gap-x-2 rounded-lg border bg-muted/40 px-3 py-2',
            isAbnormal && 'border-red-200 dark:border-red-800/50 bg-red-50/30 dark:bg-red-950/10'
          )}
        >
          {/* Title — highest priority, takes the remaining width */}
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-sm font-semibold text-foreground truncate"><HighlightText text={row.title} query={query} /></span>
              </TooltipTrigger>
              <TooltipContent>{row.title}</TooltipContent>
            </Tooltip>
            <TrendButton />
            {hasImages && <ImageButton />}
          </div>
          {obs.valueQuantity ? (
            <span
              className={cn(
                'text-sm font-bold tabular-nums shrink-0',
                isAbnormal ? 'text-red-600 dark:text-red-400' : 'text-foreground'
              )}
            >
              {value}
            </span>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className={cn(
                    'text-sm font-bold shrink max-w-[9rem] truncate',
                    isAbnormal ? 'text-red-600 dark:text-red-400' : 'text-foreground'
                  )}
                >
                  {value}
                </span>
              </TooltipTrigger>
              <TooltipContent>{value}</TooltipContent>
            </Tooltip>
          )}
          {interp && (
            <span className={cn('inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium shrink-0', interp.style)}>
              {interp.label}
            </span>
          )}
          {showRef && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-xs text-muted-foreground max-w-[6rem] truncate shrink">{refText}</span>
              </TooltipTrigger>
              <TooltipContent>{refText}</TooltipContent>
            </Tooltip>
          )}
          {/* Institution + date — the compact badge shows only the date to give
              the report name maximum width; category/status (row.meta) move to
              the hover tooltip. Falls back to the full meta when there's no date. */}
          <div className="flex items-center gap-2 shrink-0">
            {row.institution && (
              <span className="inline-flex items-center gap-1 text-xs text-blue-600/80 dark:text-blue-400/80 min-w-0 max-w-[5rem]">
                <Building2 className="h-3 w-3 shrink-0" />
                <span className="truncate">{row.institution}</span>
              </span>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="text-xs font-normal whitespace-nowrap">{dateLabel || metaWithDate}</Badge>
              </TooltipTrigger>
              <TooltipContent>{metaWithDate}</TooltipContent>
            </Tooltip>
          </div>
          {row.isPossibleDuplicate && (
            <span className="text-xs text-amber-600 dark:text-amber-400 shrink-0">⚠ 可能重複</span>
          )}
        </div>
        {imageLightbox}
        {trendDialogMounted && (
          <ObservationTrendDialog
            observation={firstObs}
            reportTitle={row.title}
            reportLookupTitle={row.rawTitle}
            open={trendDialogOpen}
            onOpenChange={setTrendDialogOpen}
          />
        )}
      </>
    )
  }

  // Multi-item report: accordion with summary
  const abnormalCount = countAbnormal(displayObs)
  const accordionDateLabel = formatDisplayDate(row.effectiveDate, row.showTime)
  const accordionMeta = row.meta + (accordionDateLabel ? ` • ${accordionDateLabel}` : '')

  return (
    <>
      <Accordion
        type="multiple"
        defaultValue={defaultOpen.includes(row.id) ? [row.id] : []}
        className="w-full"
      >
        <AccordionItem value={row.id} className="border rounded-lg bg-muted/40 px-3">
          <AccordionTrigger className="py-3">
            <div className="flex w-full flex-col gap-1 text-left">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="font-semibold text-foreground truncate"><HighlightText text={row.title} query={query} /></span>
                    </TooltipTrigger>
                    <TooltipContent>{row.title}</TooltipContent>
                  </Tooltip>
                  {/* Single observation that expands to components (e.g. Blood
                      Pressure → systolic/diastolic) — surface its composite
                      trend here. Multi-item panels (length > 1) are skipped:
                      the dialog only trends firstObs, which would mislead.
                      Procedures are skipped too — they're events, not values. */}
                  {displayObs.length === 1 && row.group !== 'procedures' && <TrendButton stopProp />}
                  {abnormalCount > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-900/30 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-400">
                      <AlertCircle className="h-3 w-3" />
                      {abnormalCount} 異常
                    </span>
                  )}
                  {/* Same-session sub-procedures grouped via Procedure.partOf —
                      tells the user this one title expands to several. */}
                  {row.group === "procedures" && (row.relatedCount ?? 0) > 0 && (
                    <span className="inline-flex items-center rounded-full bg-violet-100 dark:bg-violet-900/30 px-2 py-0.5 text-xs font-medium text-violet-700 dark:text-violet-300 shrink-0">
                      +{row.relatedCount} 相關處置
                    </span>
                  )}
                  {hasImages && <ImageButton stopProp />}
                </div>
                {/* Right cluster mirrors the single-value rows: count +
                    institution inline + date-only badge. Category/status
                    (accordionMeta) live on the badge's hover tooltip — no
                    separate meta line, so nothing is shown twice. */}
                <div className="flex items-center gap-2 shrink-0">
                  {/* "N 項" = sub-item count for a lab panel; meaningless for a
                      single procedure event, so hide it there. */}
                  {row.group !== "procedures" && (
                    <span className="text-xs text-muted-foreground">{displayObs.length} 項</span>
                  )}
                  {row.institution && (
                    <span className="inline-flex items-center gap-1 text-xs text-blue-600/80 dark:text-blue-400/80 min-w-0 max-w-[6rem]">
                      <Building2 className="h-3 w-3 shrink-0" />
                      <span className="truncate">{row.institution}</span>
                    </span>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="text-xs font-normal whitespace-nowrap">{accordionDateLabel || accordionMeta}</Badge>
                    </TooltipTrigger>
                    <TooltipContent>{accordionMeta}</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pb-4">
            <div className="grid gap-3">
              {displayObs.map((obs, i) => (
                <ObservationBlock
                  key={obs.id ? `obs-${obs.id}` : `obs-${i}`}
                  observation={obs}
                />
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      {imageLightbox}
      {/* Lazy-mount the trend dialog only after the user actually clicks
          the trend button. The dialog runs four history hooks
          (useObservationHistory + 3 variants), each of which iterates the
          full observations array. With 500+ rows in the "全部" tab, eagerly
          mounting the dialog inside every row meant 2000+ full-array
          scans on every render — the real reason switching to "全部" felt
          slow, not the row count itself. Once opened we keep it mounted
          so re-opening is instant. */}
      {trendDialogMounted && (
        <ObservationTrendDialog
          observation={firstObs}
          reportTitle={row.title}
          reportLookupTitle={row.rawTitle}
          open={trendDialogOpen}
          onOpenChange={setTrendDialogOpen}
        />
      )}
    </>
  )
}

// Memoized — `row` is stable across re-renders because the parent
// (ReportsCard) memoizes the rows array via useMemo, so referential
// equality skips re-render when only the active tab changes. This is
// the key win for tab-switch latency when "全部" has 500+ rows. The
// inactive tabs are kept mounted via forceMount, so without memo every
// tab switch would re-render every row.
const SingleReportRow = memo(ReportRowImpl)

// Public ReportRow — dispatches between the regular single-DR card
// (SingleReportRow above, with all its hooks) and the multi-region study
// card (MultiRegionStudyCard) for synthetic group rows. Kept as a thin
// component so the hook order inside SingleReportRow stays unconditional,
// honouring React's rules of hooks even when the same virtualizer slot
// flips between a group and an ungrouped row across re-renders.
export function ReportRow(props: ReportRowProps) {
  const { row } = props
  if (row.groupedRows && row.groupedRows.length > 1) {
    return <MultiRegionStudyCard row={row} />
  }
  return <SingleReportRow {...props} />
}
