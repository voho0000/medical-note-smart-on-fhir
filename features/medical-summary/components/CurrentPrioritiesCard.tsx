"use client"

import { useLayoutEffect, useRef, useState } from "react"
import { Check, ChevronDown, Copy, ShieldCheck } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { cn } from "@/src/shared/utils/cn.utils"
import { useCopyToClipboard } from "@/src/shared/hooks/use-copy-to-clipboard"
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
  copyLabel: string
  copiedLabel: string
  copyFailedLabel: string
  typeLabel: (resourceType?: string) => string
  unverifiedLabel: string
  onNavigate?: (target: ResourceNavTarget) => void
}

export function CurrentPrioritiesCard({
  result,
  title,
  generatedByLine,
  expandSummaryLabel,
  collapseSummaryLabel,
  copyLabel,
  copiedLabel,
  copyFailedLabel,
  typeLabel,
  unverifiedLabel,
  onNavigate,
}: CurrentPrioritiesCardProps) {
  const [summaryExpanded, setSummaryExpanded] = useState(false)
  const [summaryOverflowing, setSummaryOverflowing] = useState(false)
  const { copied, copy } = useCopyToClipboard()
  const summaryRef = useRef<HTMLParagraphElement>(null)
  const byKey = new Map(result.sourceIndex.map((source) => [source.key, source]))

  const handleCopy = async () => {
    const summaryText = result.summary.map((segment) => segment.text).join("").trim()
    const text = [title.trim(), result.headline.trim(), summaryText]
      .filter(Boolean)
      .join("\n")

    if (!await copy(text)) toast.error(copyFailedLabel)
  }

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
      className="overflow-hidden rounded-lg border border-border bg-card"
      aria-labelledby="current-priorities-title"
    >
      <div className="bg-primary/[0.035] px-3.5 py-3 dark:bg-primary/[0.055]">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <h3 id="current-priorities-title" className="min-w-0 flex-1 text-sm font-semibold text-foreground">
            {title}
          </h3>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-[44px] shrink-0 gap-1.5 px-2 text-xs shadow-none hover:shadow-none lg:h-8"
            onClick={handleCopy}
            aria-label={copied ? copiedLabel : copyLabel}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-300" aria-hidden="true" />
            ) : (
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span>{copied ? copiedLabel : copyLabel}</span>
          </Button>
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
            className="mt-1 inline-flex min-h-[44px] items-center gap-1 text-[0.6875rem] font-medium text-primary hover:text-primary/80 lg:min-h-8"
            aria-expanded={summaryExpanded}
          >
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", summaryExpanded && "rotate-180")} />
            {summaryExpanded ? collapseSummaryLabel : expandSummaryLabel}
          </button>
        ) : null}
      </div>

      <p className="border-t border-border px-3.5 py-1.5 text-xs leading-snug text-muted-foreground">
        {generatedByLine}
      </p>
    </section>
  )
}
