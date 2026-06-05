// EncounterSection
// Generic folding section used inside an expanded visit (diagnoses / tests /
// medications / procedures). Header always renders so the user sees the
// count even when collapsed. Auto-folds when the item count exceeds a
// threshold (multi-day inpatient stays carry 30+ labs / 10+ meds where the
// fully-expanded view is overwhelming).
"use client"

import { useState, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/src/shared/utils/cn.utils"

interface EncounterSectionProps {
  title: string
  /** Total count shown next to the title. */
  count: number
  /** When count > threshold, default to collapsed (the user opts in to long
   *  lists). When count <= threshold, default to expanded (no friction for
   *  short outpatient visits). Pass Infinity to always expand by default. */
  collapseThreshold?: number
  /** Optional small badge / chip strip shown to the right of the count
   *  (e.g. abnormal count for tests). */
  rightBadges?: ReactNode
  children: ReactNode
}

export function EncounterSection({
  title,
  count,
  collapseThreshold = Infinity,
  rightBadges,
  children,
}: EncounterSectionProps) {
  // `count > threshold` ⇒ collapsed by default. Recomputed only on first
  // render; subsequent prop changes don't override the user's toggle.
  const [expanded, setExpanded] = useState(() => count <= collapseThreshold)

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
        aria-expanded={expanded}
      >
        <span>{title}</span>
        <span className="inline-flex items-center rounded-full bg-muted/70 px-1.5 py-0 text-[10px] tabular-nums text-muted-foreground normal-case">
          {count}
        </span>
        {rightBadges}
        <ChevronDown
          className={cn(
            "ml-auto h-4 w-4 shrink-0 transition-transform duration-200",
            expanded && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {expanded && <div>{children}</div>}
    </div>
  )
}
