// 其他警示 — medium/low safety alerts, closed by default at the very bottom.
// The high tier already sits in 開藥前必看; keeping the rest visible but folded
// preserves the 不遮蔽 principle without letting a long monitoring list compete
// with the facts that change today's prescription.
"use client"

import { useState, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/src/shared/utils/cn.utils"
import type { SafetyAlert } from "@/src/core/entities/safety-alert.entity"
import { SafetyAlertCard } from "@/features/proactive-safety-alerts/components/SafetyAlertCard"

interface OtherAlertsDisclosureProps {
  alerts: SafetyAlert[]
  /** "其他警示 ({count})" */
  title: string
  disclaimer: string
  renderSources?: (keys: string[], unsupportedKeys?: string[]) => ReactNode
}

export function OtherAlertsDisclosure({
  alerts,
  title,
  disclaimer,
  renderSources,
}: OtherAlertsDisclosureProps) {
  const [open, setOpen] = useState(false)
  if (alerts.length === 0) return null

  return (
    <section className="rounded-lg border border-border bg-card px-3 py-1.5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex min-h-[44px] w-full items-center gap-1.5 text-left text-[0.6875rem] font-semibold tracking-wide text-muted-foreground transition-colors hover:text-foreground lg:min-h-8"
      >
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-180")} />
        {title.replace("{count}", String(alerts.length))}
      </button>
      {open ? (
        <div className="pb-1.5">
          <div className="max-h-[24rem] overflow-y-auto scrollbar-thin-persistent">
            {alerts.map((alert) => (
              <SafetyAlertCard
                key={alert.id}
                alert={alert}
                density="compact"
                renderSources={renderSources}
              />
            ))}
          </div>
          <p className="mt-1 text-[0.65rem] leading-snug text-muted-foreground/70">{disclaimer}</p>
        </div>
      ) : null}
    </section>
  )
}
