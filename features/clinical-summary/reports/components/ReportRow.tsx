// Report Row Component
import { useState } from 'react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { TrendingUp, Building2, AlertCircle, Copy, Check } from 'lucide-react'
import { cn } from "@/src/shared/utils/cn.utils"
import type { Row, Observation } from '../types'
import { getConceptText, getValueWithUnit, getReferenceRangeText } from '../utils/fhir-helpers'
import { getInterpretationTag, checkReferenceRangeAbnormal } from '../utils/interpretation-helpers'
import { ObservationBlock } from './ObservationBlock'
import { ObservationTrendDialog } from './ObservationTrendDialog'
import { useLanguage } from "@/src/application/providers/language.provider"

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

export function ReportRow({ row, defaultOpen }: ReportRowProps) {
  const { t } = useLanguage()
  const [trendDialogOpen, setTrendDialogOpen] = useState(false)
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
        setTrendDialogOpen(true)
      }}
      className="text-muted-foreground hover:text-primary transition-colors cursor-pointer"
      role="button"
      tabIndex={0}
      aria-label="查看趨勢"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          if (stopProp) e.stopPropagation()
          setTrendDialogOpen(true)
        }
      }}
    >
      <TrendingUp className="h-4 w-4" />
    </div>
  )

  const MetaInfo = () => (
    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
      {row.obs[0]?.status && (
        <span>
          <span className="font-medium text-foreground/80">{t.reports.status}:</span>{' '}
          {row.obs[0]?.status}
        </span>
      )}
      {row.obs[0]?.category && (
        <span>
          <span className="font-medium text-foreground/80">{t.reports.category}:</span>{' '}
          {getConceptText(row.obs[0]?.category)}
        </span>
      )}
      {row.institution && (
        <span className="inline-flex items-center gap-1 text-blue-600/80 dark:text-blue-400/80">
          <Building2 className="h-3 w-3" />
          {row.institution}
        </span>
      )}
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

    const HeaderRight = () => (
      <div className="flex items-center gap-2 shrink-0">
        {row.institution && (
          <span className="inline-flex items-center gap-1 text-xs text-blue-600/80 dark:text-blue-400/80">
            <Building2 className="h-3 w-3" />
            {row.institution}
          </span>
        )}
        <Badge variant="outline" className="text-xs font-normal">{metaWithDate}</Badge>
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
              className="flex items-center justify-between gap-2 mb-1 cursor-pointer select-none"
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
          <ObservationTrendDialog
            observation={firstObs}
            reportTitle={row.title}
            open={trendDialogOpen}
            onOpenChange={setTrendDialogOpen}
          />
        </>
      )
    }

    // Numeric or short text: single-row compact display
    const value = obs.valueQuantity
      ? getValueWithUnit(obs.valueQuantity)
      : obs.valueString || '—'

    return (
      <>
        <div
          className={cn(
            'flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border bg-muted/40 px-3 py-2',
            isAbnormal && 'border-red-200 dark:border-red-800/50 bg-red-50/30 dark:bg-red-950/10'
          )}
        >
          {/* Left: title + value + interp + ref */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-sm font-semibold text-foreground truncate">{row.title}</span>
                </TooltipTrigger>
                <TooltipContent>{row.title}</TooltipContent>
              </Tooltip>
              <TrendButton />
            </div>
            <span
              className={cn(
                'text-sm font-bold tabular-nums shrink-0',
                isAbnormal ? 'text-red-600 dark:text-red-400' : 'text-foreground'
              )}
            >
              {value}
            </span>
            {interp && (
              <span className={cn('inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium shrink-0', interp.style)}>
                {interp.label}
              </span>
            )}
            {refText && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-xs text-muted-foreground max-w-[8rem] truncate">{refText}</span>
                </TooltipTrigger>
                <TooltipContent>{refText}</TooltipContent>
              </Tooltip>
            )}
          </div>
          <HeaderRight />
          {row.isPossibleDuplicate && (
            <span className="text-xs text-amber-600 dark:text-amber-400 shrink-0">⚠ 可能重複</span>
          )}
        </div>
        <ObservationTrendDialog
          observation={firstObs}
          reportTitle={row.title}
          open={trendDialogOpen}
          onOpenChange={setTrendDialogOpen}
        />
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
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{displayObs.length} 項</span>
                  <Badge variant="outline" className="text-xs font-normal">{accordionMeta}</Badge>
                </div>
              </div>
              <MetaInfo />
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
      <ObservationTrendDialog
        observation={firstObs}
        reportTitle={row.title}
        open={trendDialogOpen}
        onOpenChange={setTrendDialogOpen}
      />
    </>
  )
}
