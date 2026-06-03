// Report Row Component
import { useState, memo } from 'react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { TrendingUp, Building2, AlertCircle, Copy, Check, ChevronDown } from 'lucide-react'
import { cn } from "@/src/shared/utils/cn.utils"
import type { Row, Observation } from '../types'
import { getValueWithUnit, getReferenceRangeText } from '../utils/fhir-helpers'
import { getInterpretationTag, checkReferenceRangeAbnormal } from '../utils/interpretation-helpers'
import { ObservationBlock } from './ObservationBlock'
import { ObservationTrendDialog } from './ObservationTrendDialog'

interface ReportRowProps {
  row: Row
  defaultOpen: string[]
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

function ReportRowImpl({ row, defaultOpen }: ReportRowProps) {
  const [trendDialogOpen, setTrendDialogOpen] = useState(false)
  // Separate "mounted" flag so the dialog (and its expensive history hooks)
  // only enter the React tree after the user actually opens it the first
  // time. We keep it mounted afterwards so re-opening is instant.
  const [trendDialogMounted, setTrendDialogMounted] = useState(false)
  const openTrendDialog = () => {
    setTrendDialogMounted(true)
    setTrendDialogOpen(true)
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

  const displayObs = row.group === "procedures" ? row.obs.slice(1) : row.obs
  const firstObs = row.obs[0]

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
    const isLongText = !obs.valueQuantity && (obs.valueString?.length ?? 0) > 80

    const dateLabel = formatDisplayDate(row.effectiveDate, row.showTime)
    const metaWithDate = row.meta + (dateLabel ? ` • ${dateLabel}` : '')

    // Date-only badge + institution inline, consistent with the single-value
    // and accordion rows. Category/status (e.g. "Radiology • final") are noise
    // in this dataset — they live on the badge's hover tooltip instead.
    const HeaderRight = () => (
      <div className="flex items-center gap-2 shrink-0">
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
      return (
        <>
          <div className="rounded-lg border bg-muted/40 px-3 py-2">
            <div
              className="flex items-center justify-between gap-2 mb-1 rounded-md cursor-pointer select-none transition-all outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
              role="button"
              tabIndex={0}
              aria-expanded={textExpanded}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('[aria-label="查看趨勢"]')) return
                setTextExpanded(!textExpanded)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setTextExpanded(!textExpanded)
                }
              }}
            >
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-sm font-semibold text-foreground truncate">{row.title}</span>
                  </TooltipTrigger>
                  <TooltipContent>{row.title}</TooltipContent>
                </Tooltip>
                <TrendButton />
              </div>
              <div className="flex items-center gap-2">
                <HeaderRight />
                {row.isPossibleDuplicate && (
                  <span className="text-xs text-amber-600 dark:text-amber-400 shrink-0">⚠ 可能重複</span>
                )}
                <ChevronDown
                  className={cn(
                    'h-4 w-4 shrink-0 text-muted-foreground pointer-events-none transition-transform duration-200',
                    textExpanded && 'rotate-180'
                  )}
                />
              </div>
            </div>
            <p
              className={cn(
                'text-xs text-foreground/80 leading-relaxed',
                textExpanded ? 'whitespace-pre-wrap' : 'line-clamp-1 cursor-pointer'
              )}
              onClick={() => {
                if (!textExpanded) setTextExpanded(true)
              }}
            >
              {textExpanded ? fullText : obs.valueString}
            </p>
            {textExpanded && (
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
          {trendDialogMounted && (
            <ObservationTrendDialog
              observation={firstObs}
              reportTitle={row.title}
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
                <span className="text-sm font-semibold text-foreground truncate">{row.title}</span>
              </TooltipTrigger>
              <TooltipContent>{row.title}</TooltipContent>
            </Tooltip>
            <TrendButton />
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
        {trendDialogMounted && (
          <ObservationTrendDialog
            observation={firstObs}
            reportTitle={row.title}
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
                      <span className="font-semibold text-foreground truncate">{row.title}</span>
                    </TooltipTrigger>
                    <TooltipContent>{row.title}</TooltipContent>
                  </Tooltip>
                  {abnormalCount > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-900/30 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-400">
                      <AlertCircle className="h-3 w-3" />
                      {abnormalCount} 異常
                    </span>
                  )}
                </div>
                {/* Right cluster mirrors the single-value rows: count +
                    institution inline + date-only badge. Category/status
                    (accordionMeta) live on the badge's hover tooltip — no
                    separate meta line, so nothing is shown twice. */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground">{displayObs.length} 項</span>
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
export const ReportRow = memo(ReportRowImpl)
