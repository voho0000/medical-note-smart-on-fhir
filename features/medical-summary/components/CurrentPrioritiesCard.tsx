"use client"

import { useLayoutEffect, useRef, useState } from "react"
import { ChevronDown, Loader2, ShieldCheck } from "lucide-react"
import { cn } from "@/src/shared/utils/cn.utils"
import type {
  MedicalSummaryResult,
  ResolvedSourceRef,
} from "@/src/core/entities/medical-summary.entity"
import type { ResourceNavTarget } from "@/src/application/stores/resource-navigation.store"
import { SourceSup } from "./SourceSup"

interface CurrentPrioritiesCardProps {
  result: MedicalSummaryResult
  title: string
  generatedByLine: string
  expandSummaryLabel: string
  collapseSummaryLabel: string
  typeLabel: (resourceType?: string) => string
  unverifiedLabel: string
  onNavigate?: (target: ResourceNavTarget) => void
  updating?: boolean
}

export function CurrentPrioritiesCard({
  result,
  title,
  generatedByLine,
  expandSummaryLabel,
  collapseSummaryLabel,
  typeLabel,
  unverifiedLabel,
  onNavigate,
  updating = false,
}: CurrentPrioritiesCardProps) {
  const [summaryExpanded, setSummaryExpanded] = useState(false)
  const [summaryOverflowing, setSummaryOverflowing] = useState(false)
  const summaryRef = useRef<HTMLParagraphElement>(null)
  const byKey = new Map(result.sourceIndex.map((source) => [source.key, source]))

  useLayoutEffect(() => {
    const el = summaryRef.current
    if (!el) return

    const measure = () => {
      const style = window.getComputedStyle(el)
      const fontSize = Number.parseFloat(style.fontSize)
      const lineHeight = Number.parseFloat(style.lineHeight)
      const effectiveLineHeight = Number.isFinite(lineHeight)
        ? lineHeight
        : Number.isFinite(fontSize)
          ? fontSize * 1.375
          : 18
      const collapsedHeight = Math.ceil(effectiveLineHeight * 4)
      const isOverflowing = el.scrollHeight > collapsedHeight + 1
      setSummaryOverflowing(isOverflowing)
      if (!isOverflowing) setSummaryExpanded(false)
    }

    measure()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [result.summary])

  return (
    <section
      className="overflow-hidden rounded-lg border border-teal-200/80 bg-card shadow-sm dark:border-teal-900/70"
      aria-labelledby="current-priorities-title"
    >
      <div className="bg-teal-50/60 px-3.5 py-3 dark:bg-teal-950/20">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-teal-600 text-white shadow-sm dark:bg-teal-500 dark:text-teal-950">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <h3 id="current-priorities-title" className="min-w-0 flex-1 text-sm font-semibold text-foreground">
            {title}
          </h3>
          {updating ? <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" /> : null}
        </div>
        <p className="mt-2 text-[0.875rem] font-semibold leading-snug text-foreground @min-[48rem]:text-[0.9375rem]">
          {result.headline}
        </p>
        <p ref={summaryRef} className={cn(
          "mt-1 text-[0.8125rem] leading-snug text-foreground/85",
          !summaryExpanded && "line-clamp-4",
        )}>
          {result.summary.map((segment, index) => {
            const sources = segment.sourceKeys
              .map((key) => byKey.get(key))
              .filter((source): source is ResolvedSourceRef => source !== undefined)
            return (
              <span key={index}>
                <span className={cn(segment.emphasis && "font-semibold text-foreground")}>{segment.text}</span>
                <SourceSup
                  sources={sources}
                  typeLabel={typeLabel}
                  unverifiedLabel={unverifiedLabel}
                  onNavigate={onNavigate}
                />
              </span>
            )
          })}
        </p>
        {summaryOverflowing ? (
          <button
            type="button"
            onClick={() => setSummaryExpanded((value) => !value)}
            className="mt-1 inline-flex items-center gap-1 text-[0.6875rem] font-medium text-teal-700 hover:text-teal-800 dark:text-teal-300"
            aria-expanded={summaryExpanded}
          >
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", summaryExpanded && "rotate-180")} />
            {summaryExpanded ? collapseSummaryLabel : expandSummaryLabel}
          </button>
        ) : null}
      </div>

      <p className="border-t border-border px-3.5 py-1.5 text-[0.625rem] leading-snug text-muted-foreground/70">
        {generatedByLine}
      </p>
    </section>
  )
}
