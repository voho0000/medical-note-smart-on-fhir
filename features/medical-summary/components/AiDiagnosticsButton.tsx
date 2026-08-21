"use client"

import { Bug } from "lucide-react"
import { Button } from "@/components/ui/button"

interface AiDiagnosticsButtonProps {
  hasRecords: boolean
  availableLabel: string
  unavailableLabel: string
  onClick: () => void
}

/**
 * Compact secondary access to the current AI execution record. The ready
 * state has a visible container; the empty state falls back to a quiet,
 * disabled glyph so availability is not communicated by colour alone.
 */
export function AiDiagnosticsButton({
  hasRecords,
  availableLabel,
  unavailableLabel,
  onClick,
}: AiDiagnosticsButtonProps) {
  const label = hasRecords ? availableLabel : unavailableLabel

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      data-testid="medical-summary-ai-diagnostics-export"
      data-state={hasRecords ? "ready" : "empty"}
      className={hasRecords
        ? "h-7 w-7 border border-primary/30 bg-primary/10 text-primary shadow-none hover:border-primary/45 hover:bg-primary/15 hover:text-primary"
        : "h-7 w-7 border border-transparent bg-transparent text-muted-foreground/35 shadow-none disabled:opacity-100"
      }
      onClick={onClick}
      disabled={!hasRecords}
      title={label}
      aria-label={label}
    >
      <Bug className="h-3.5 w-3.5" />
    </Button>
  )
}
