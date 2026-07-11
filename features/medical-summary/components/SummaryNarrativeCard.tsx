// Cross-hospital narrative card — the POC's "AI 交班簡報" block. Segments
// render as ONE flowing paragraph; emphasised segments get the highlight mark
// and superscript citation numbers. Sources live IN the superscripts now
// (hover on desktop, tap on mobile via SourceSup) — the old always-visible
// chip row doubled the card height for information that is only needed when
// auditing a specific claim.
"use client"

import { Loader2 } from "lucide-react"
import type {
  MedicalSummaryResult,
  ResolvedSourceRef,
} from "@/src/core/entities/medical-summary.entity"
import type { ResourceNavTarget } from "@/src/application/stores/resource-navigation.store"
import { SourceSup } from "./SourceSup"

interface SummaryNarrativeCardProps {
  result: MedicalSummaryResult
  title: string
  generatedByLine: string
  typeLabel: (resourceType?: string) => string
  unverifiedLabel: string
  onNavigate?: (target: ResourceNavTarget) => void
  /** True while a REGENERATION streams — the old result stays visible, so a
   *  small spinner is the only cue anything is happening. */
  updating?: boolean
}

export function SummaryNarrativeCard({
  result,
  title,
  generatedByLine,
  typeLabel,
  unverifiedLabel,
  onNavigate,
  updating = false,
}: SummaryNarrativeCardProps) {
  const byKey = new Map(result.sourceIndex.map((s) => [s.key, s]))

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <h3 className="mb-1.5 flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-wide text-muted-foreground">
        {title}
        {updating ? <Loader2 className="h-3 w-3 animate-spin text-violet-500" /> : null}
      </h3>
      {/* Body caps then scrolls (title fixed above, responsibility
          footer fixed below) — a safety net; the narrative rarely overflows. */}
      <div className="max-h-[24rem] overflow-y-auto scrollbar-thin-persistent">
        <p className="text-[0.8125rem] font-semibold leading-snug text-foreground">{result.headline}</p>
        <p className="mt-1 text-[0.8125rem] leading-normal text-foreground">
          {result.summary.map((seg, i) => {
            const sources = seg.sourceKeys
              .map((k) => byKey.get(k))
              .filter((s): s is ResolvedSourceRef => s !== undefined)
            const sup = (
              <SourceSup
                sources={sources}
                typeLabel={typeLabel}
                unverifiedLabel={unverifiedLabel}
                onNavigate={onNavigate}
              />
            )
            return seg.emphasis ? (
              <span key={i}>
                <span className="rounded bg-violet-100 px-1 font-semibold text-violet-900 dark:bg-violet-500/15 dark:text-violet-300">
                  {seg.text}
                </span>
                {sup}
              </span>
            ) : (
              <span key={i}>
                {seg.text}
                {sup}
              </span>
            )
          })}
        </p>
      </div>
      <p className="mt-2 border-t border-border pt-1.5 text-[0.65rem] leading-snug text-muted-foreground/70">
        {generatedByLine}
      </p>
    </div>
  )
}
